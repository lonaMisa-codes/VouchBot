const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, PermissionFlagsBits: P, MessageFlags,
} = require('discord.js');
const config = require('./config');
const store = require('./store');
const { money, short, stacks } = require('./utils');

const EPH = MessageFlags.Ephemeral;
const MEMBER_PERMS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];

const row = (...c) => new ActionRowBuilder().addComponents(...c);
const btn = (id, label, emoji, style) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
const textInput = (id, label, style, max, placeholder) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max);
  return placeholder ? t.setPlaceholder(placeholder) : t;
};

const skeletonPrices = () => store.getMeta('prices')?.[config.SPAWNERS[0]] ?? null;

// ---- Panels (posted by /ticketpanel and reused by the price panel) ----
function panel(type) {
  if (type === 'spawner') {
    return {
      embeds: [new EmbedBuilder().setColor(config.COLORS.vouch).setTitle('🧱 Spawner Trading')
        .setDescription('Want to **buy** or **sell** Skeleton spawners? Pick an option below, fill in the form, and a private ticket will open for you.')],
      components: [row(
        btn('ticket:open:buy', 'Buy Spawners', '🛒', ButtonStyle.Success),
        btn('ticket:open:sell', 'Sell Spawners', '💸', ButtonStyle.Primary),
      )],
    };
  }
  return {
    embeds: [new EmbedBuilder().setColor(config.COLORS.info).setTitle('🎫 Support')
      .setDescription('Need help or have a question? Press the button below to open a private ticket.')],
    components: [row(btn('ticket:open:support', 'Open Ticket', '🎫', ButtonStyle.Secondary))],
  };
}

// ---- Helpers ----
// Channel topic is the ticket record: ticket:<openerId>:<spawner|support>
const ticketInfo = (channel) => {
  const m = channel?.topic?.match(/^ticket:(\d+):(\w+)$/);
  return m ? { openerId: m[1], type: m[2] } : null;
};

// Ticket controls (close, claim, unclaim, add): the owner or the optional command role only
const isStaff = (i) => i.user.id === config.targetId
  || !!(config.commandRoleId && i.member.roles.cache.has(config.commandRoleId));

const claims = () => store.getMeta('claims') ?? {};
const setClaim = (channelId, userId) => {
  const next = { ...claims() };
  if (userId) next[channelId] = userId; else delete next[channelId];
  store.setMeta('claims', next);
};

const deny = (i, text) => i.reply({ content: text, flags: EPH });

// ---- Opening tickets ----
function openForm(i, side) {
  if (!['buy', 'sell'].includes(side)) return;
  return i.showModal(new ModalBuilder()
    .setCustomId(`ticket:form:${side}`)
    .setTitle(side === 'buy' ? 'Buy Skeleton Spawners' : 'Sell Skeleton Spawners')
    .addComponents(
      row(textInput('ign', 'Your IGN', TextInputStyle.Short, 32, 'Your Minecraft name')),
      row(textInput('amount', 'Amount of spawners', TextInputStyle.Short, 10, 'e.g. 105')),
    ));
}

async function submitForm(i, side) {
  if (!['buy', 'sell'].includes(side)) return;
  const ign = i.fields.getTextInputValue('ign').trim();
  const amount = parseInt(i.fields.getTextInputValue('amount').replace(/[,\s]/g, ''), 10);
  if (!ign) return deny(i, 'Please enter your IGN.');
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) return deny(i, 'Amount must be a whole number, e.g. `105`.');
  return createTicket(i, { type: 'spawner', side, ign, amount });
}

async function createTicket(i, d) {
  await i.deferReply({ flags: EPH });
  const { guild, user } = i;

  const topic = `ticket:${user.id}:${d.type}`;
  const existing = guild.channels.cache.find((c) => c.topic === topic);
  if (existing) return i.editReply(`You already have an open ticket: ${existing}`);

  // Roles are only used if set in .env
  const roleIds = [config.commandRoleId].filter(Boolean);
  const owner = config.targetId && config.targetId !== user.id
    ? await guild.members.fetch(config.targetId).catch(() => null) : null;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: user.id, allow: MEMBER_PERMS },
    { id: i.client.user.id, allow: [...MEMBER_PERMS, P.ManageChannels] },
    ...roleIds.map((id) => ({ id, allow: MEMBER_PERMS })),
    ...(owner ? [{ id: owner.id, allow: MEMBER_PERMS }] : []),
  ];

  let channel;
  try {
    channel = await guild.channels.create({
      name: (d.type === 'spawner' ? `${d.side}-${user.username}` : `support-${user.username}`).slice(0, 90),
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId || undefined,
      topic,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    console.error('Ticket create failed:', err.message);
    return i.editReply('I could not create the ticket. I need the Manage Channels permission, and any role / category IDs in .env must be correct.');
  }

  const pingUsers = [user.id, owner?.id].filter(Boolean);
  await channel.send({
    content: [...pingUsers.map((id) => `<@${id}>`), ...roleIds.map((id) => `<@&${id}>`)].join(' '),
    allowedMentions: { users: pingUsers, roles: roleIds },
    embeds: [new EmbedBuilder().setColor(config.COLORS.vouch).setTitle('🎫 Ticket Opened')
      .addFields(
        { name: '📁 Type', value: d.type === 'spawner' ? 'Spawner' : 'Support', inline: true },
        { name: '👤 Opened by', value: `<@${user.id}>`, inline: true },
        { name: '​', value: 'Support will be with you shortly.\nUse the buttons below to manage this ticket.' },
      )],
    components: [row(
      btn('ticket:close', 'Close', '🔒', ButtonStyle.Danger),
      btn('ticket:closereason', 'Close with Reason', '📝', ButtonStyle.Secondary),
      btn('ticket:claim', 'Claim', '⚡', ButtonStyle.Primary),
      btn('ticket:unclaim', 'Unclaim', '🔓', ButtonStyle.Secondary),
      btn('ticket:add', 'Add to Ticket', '➕', ButtonStyle.Secondary),
    )],
  });

  if (d.type === 'spawner') {
    const p = skeletonPrices();
    await channel.send({
      embeds: [new EmbedBuilder().setColor(config.COLORS.vouch).setTitle('🧱 Spawner Ticket')
        .addFields(
          { name: 'IGN', value: d.ign, inline: true },
          { name: 'Buy or Sell', value: d.side, inline: true },
          { name: 'Amount', value: d.amount.toLocaleString('en-US'), inline: true },
          { name: 'Current Prices', value: p ? `Buy: **${money(p.buy)}** each • Sell: **${money(p.sell)}** each` : 'Not set yet' },
        )],
    });
    if (p) {
      const each = d.side === 'buy' ? p.buy : p.sell;
      await channel.send(`💰 **Total: ${money(d.amount * each)}** (${stacks(d.amount)}) (${d.amount.toLocaleString('en-US')} × ${short(each)} each)`);
    }
  }
  return i.editReply(`Your ticket is ready: ${channel}`);
}

// ---- Managing tickets ----
function closeNow(channel) {
  setClaim(channel.id, null);
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

async function close(i) {
  const info = ticketInfo(i.channel);
  if (!info) return;
  if (!isStaff(i)) return deny(i, 'Only the owner can close tickets.');
  await i.reply('🔒 Closing this ticket in 5 seconds...');
  closeNow(i.channel);
}

function closeWithReason(i) {
  const info = ticketInfo(i.channel);
  if (!info) return;
  if (!isStaff(i)) return deny(i, 'Only the owner can close tickets.');
  return i.showModal(new ModalBuilder().setCustomId('ticket:reason').setTitle('Close with Reason')
    .addComponents(row(textInput('reason', 'Reason', TextInputStyle.Paragraph, 500))));
}

async function closeReasoned(i, reason) {
  const info = ticketInfo(i.channel);
  if (!info) return;
  if (!isStaff(i)) return deny(i, 'Only the owner can close tickets.');
  await i.reply({
    content: `🔒 Ticket closed by <@${i.user.id}>.\n**Reason:** ${reason}\nDeleting in 5 seconds...`,
    allowedMentions: { parse: [] },
  });
  closeNow(i.channel);
}

const submitReason = (i) => closeReasoned(i, i.fields.getTextInputValue('reason'));

async function claim(i) {
  if (!ticketInfo(i.channel)) return;
  if (!isStaff(i)) return deny(i, 'Only the owner can claim tickets.');
  const by = claims()[i.channel.id];
  if (by) return deny(i, `This ticket is already claimed by <@${by}>.`);
  setClaim(i.channel.id, i.user.id);
  return i.reply({ content: `⚡ <@${i.user.id}> claimed this ticket.`, allowedMentions: { parse: [] } });
}

async function unclaim(i) {
  if (!ticketInfo(i.channel)) return;
  const by = claims()[i.channel.id];
  if (!by) return deny(i, 'This ticket is not claimed.');
  if (!isStaff(i)) return deny(i, 'Only the owner can unclaim tickets.');
  setClaim(i.channel.id, null);
  return i.reply({ content: `🔓 <@${i.user.id}> unclaimed this ticket.`, allowedMentions: { parse: [] } });
}

function addToTicket(i) {
  if (!ticketInfo(i.channel)) return;
  if (!isStaff(i)) return deny(i, 'Only the owner can add people to a ticket.');
  return i.showModal(new ModalBuilder().setCustomId('ticket:adduser').setTitle('Add to Ticket')
    .addComponents(row(textInput('user', 'User ID or @mention', TextInputStyle.Short, 60, '123456789012345678'))));
}

async function addMember(i, member) {
  await i.channel.permissionOverwrites.edit(member.id, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true,
  });
  return i.reply({ content: `➕ Added <@${member.id}> to the ticket.`, allowedMentions: { users: [member.id] } });
}

async function submitAdd(i) {
  if (!ticketInfo(i.channel)) return;
  if (!isStaff(i)) return deny(i, 'Only the owner can add people to a ticket.');
  const id = i.fields.getTextInputValue('user').match(/\d{15,20}/)?.[0];
  const member = id ? await i.guild.members.fetch(id).catch(() => null) : null;
  if (!member) return deny(i, 'I could not find that user in this server.');
  return addMember(i, member);
}

// ---- Router for every ticket button / form ----
async function handle(i) {
  const id = i.customId;
  if (i.isModalSubmit()) {
    if (id.startsWith('ticket:form:')) return submitForm(i, id.split(':')[2]);
    if (id === 'ticket:reason') return submitReason(i);
    if (id === 'ticket:adduser') return submitAdd(i);
    return;
  }
  const [, action, arg] = id.split(':');
  if (action === 'open') return arg === 'support' ? createTicket(i, { type: 'support' }) : openForm(i, arg);
  if (action === 'close') return close(i);
  if (action === 'closereason') return closeWithReason(i);
  if (action === 'claim') return claim(i);
  if (action === 'unclaim') return unclaim(i);
  if (action === 'add') return addToTicket(i);
}

// ---- Slash command versions of the ticket buttons (/ticket ...) ----
async function command(i) {
  if (!i.guild || !ticketInfo(i.channel)) return deny(i, 'Use this inside a ticket channel.');
  const sub = i.options.getSubcommand();
  if (sub === 'claim') return claim(i);
  if (sub === 'unclaim') return unclaim(i);
  if (sub === 'add') {
    if (!isStaff(i)) return deny(i, 'Only the owner can add people to a ticket.');
    const member = i.options.getMember('user') ?? await i.guild.members.fetch(i.options.getUser('user').id).catch(() => null);
    if (!member) return deny(i, 'I could not find that user in this server.');
    return addMember(i, member);
  }
}

// /close [reason]
async function closeCommand(i) {
  if (!i.guild || !ticketInfo(i.channel)) return deny(i, 'Use this inside a ticket channel.');
  const reason = i.options.getString('reason');
  return reason ? closeReasoned(i, reason) : close(i);
}

module.exports = { panel, handle, command, closeCommand };
