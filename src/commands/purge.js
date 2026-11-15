const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags,
} = require('discord.js');
const config = require('../config');
const { ownerOnly } = require('../owner');

const DAY14 = 14 * 24 * 60 * 60 * 1000;
const LINK = /https?:\/\/\S+/i;

const FILTERS = {
  all: { name: 'Everything', test: () => true },
  humans: { name: 'Humans only', test: (m) => !m.author.bot },
  bots: { name: 'Bots only', test: (m) => m.author.bot },
  attachments: { name: 'Messages with attachments', test: (m) => m.attachments.size > 0 },
  links: { name: 'Messages with links', test: (m) => LINK.test(m.content) },
  embeds: { name: 'Messages with embeds', test: (m) => m.embeds.length > 0 },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Owner: delete messages in this channel (asks for confirmation first)')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('amount').setDescription('How many messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
    .addStringOption((o) => o.setName('filter').setDescription('Only delete a certain kind of message')
      .addChoices(...Object.entries(FILTERS).map(([value, f]) => ({ name: f.name, value }))))
    .addStringOption((o) => o.setName('contains').setDescription('Only delete messages containing this text').setMaxLength(100))
    .addIntegerOption((o) => o.setName('scan').setDescription('How many recent messages to look through (default 100, max 500)').setMinValue(1).setMaxValue(500))
    .addBooleanOption((o) => o.setName('include_pinned').setDescription('Also delete pinned messages (default: no)')),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const needsContent = i.options.getString('contains') || ['attachments', 'links', 'embeds'].includes(i.options.getString('filter'));
    if (needsContent && !config.messageContent) {
      return i.editReply('The `contains`, `links`, `attachments` and `embeds` filters need the **Message Content Intent**. Turn it on in the Developer Portal (Bot > Privileged Gateway Intents), set `MESSAGE_CONTENT_INTENT=true` in `.env` and restart. The `user`, `humans`, `bots`, `scan` and `include_pinned` options work without it.');
    }

    const amount = i.options.getInteger('amount');
    const user = i.options.getUser('user');
    const filterKey = i.options.getString('filter') ?? 'all';
    const contains = i.options.getString('contains')?.toLowerCase();
    const scan = i.options.getInteger('scan') ?? 100;
    const includePinned = i.options.getBoolean('include_pinned') ?? false;

    // Find the messages that match, newest first
    const picked = [];
    let skippedOld = 0;
    let scanned = 0;
    let before;
    try {
      while (scanned < scan && picked.length < amount) {
        const batch = await i.channel.messages.fetch({ limit: Math.min(100, scan - scanned), before });
        if (!batch.size) break;
        scanned += batch.size;
        before = batch.last().id;
        for (const m of batch.values()) {
          if (picked.length >= amount) break;
          if (user && m.author.id !== user.id) continue;
          if (!FILTERS[filterKey].test(m)) continue;
          if (contains && !m.content.toLowerCase().includes(contains)) continue;
          if (m.pinned && !includePinned) continue;
          if (Date.now() - m.createdTimestamp >= DAY14) { skippedOld++; continue; } // Discord cannot bulk delete these
          picked.push(m.id);
        }
      }
    } catch (err) {
      console.error(err);
      return i.editReply('I could not read messages here. I need View Channel, Read Message History and Manage Messages in this channel.');
    }

    if (!picked.length) {
      return i.editReply(`Nothing to delete. No matching messages found in the last ${scanned} messages${skippedOld ? ` (${skippedOld} matched but are older than 14 days)` : ''}.`);
    }

    const summary = [
      `⚠️ **Delete ${picked.length} message${picked.length === 1 ? '' : 's'} in ${i.channel}?**`,
      '',
      `• **Filter:** ${FILTERS[filterKey].name}`,
      `• **From:** ${user ? `<@${user.id}>` : 'Anyone'}`,
      `• **Contains:** ${contains ? `\`${contains}\`` : 'Any text'}`,
      `• **Looked through:** last ${scanned} messages`,
      `• **Pinned messages:** ${includePinned ? 'Included' : 'Skipped'}`,
      ...(skippedOld ? [`• ${skippedOld} matching message${skippedOld === 1 ? ' is' : 's are'} older than 14 days and will be skipped`] : []),
      '',
      'This cannot be undone. Confirm within 30 seconds.',
    ].join('\n');

    const buttons = (disabled = false) => [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('purge:confirm').setLabel(`Delete ${picked.length}`).setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId('purge:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    )];

    const prompt = await i.editReply({ content: summary, components: buttons(), allowedMentions: { parse: [] } });

    let press;
    try {
      press = await prompt.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (b) => b.user.id === i.user.id,
        time: 30_000,
      });
    } catch {
      return i.editReply({ content: '⌛ Purge timed out. Nothing was deleted.', components: [] });
    }

    if (press.customId !== 'purge:confirm') {
      return press.update({ content: '❌ Purge cancelled. Nothing was deleted.', components: [] });
    }

    await press.update({ content: 'Deleting...', components: [] });
    try {
      const deleted = await i.channel.bulkDelete(picked, true);
      return i.editReply(`🗑️ Deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      return i.editReply('I could not delete those messages. I need Manage Messages in this channel.');
    }
  },
};
