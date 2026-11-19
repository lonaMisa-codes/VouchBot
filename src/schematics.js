const config = require('./config');
const store = require('./store');
const { toFile } = require('./post');
const { describeSize, formatBytes } = require('./litematic');

// Schematic posting. Two kinds of channel:
//  - posting channel: the bot re-posts the pictures AND the schematic file (build number like B1)
//  - booster channel: the bot re-posts the pictures ONLY, with the booster text (build number like BB1)
// In either one: send ONE message with the pictures + the schematic file (a caption is used as the build name),
// then REPLY to it with the owner(s): mention them, or type their names (several: comma, & or "and").
// The bot posts the result and removes your two messages. Needs the Message Content intent
// (MESSAGE_CONTENT_INTENT=true) and Manage Messages in those channels.
// Channels come from .env and from the /schematicchannel and /boosterchannel commands.

const E = config.schematic.emojis;
const WARNING = 'Taking this schematic and reposting it in your own server without credit or permission will result in removal of access, scammer roles across partnered servers, and possible blacklist.';
const BOOSTER_NOTE = 'To access any of these booster schematics, you will need to boost our server as its the only to get them.';

const KINDS = {
  posting: { key: 'schemChannels', env: () => config.schematic.channels },
  booster: { key: 'boosterChannels', env: () => config.schematic.boosterChannels },
};

// Channels saved by the commands are added on top of the ones from .env
const channelsOf = (kind) => ({ ...KINDS[kind].env(), ...(store.getMeta(KINDS[kind].key) ?? {}) });
const prefixOf = (channelId) => {
  const post = channelsOf('posting')[channelId];
  if (post) return { kind: 'posting', prefix: post };
  const boost = channelsOf('booster')[channelId];
  return boost ? { kind: 'booster', prefix: boost } : null;
};

function addChannel(kind, channelId, prefix) {
  const other = kind === 'posting' ? 'booster' : 'posting';
  if (channelsOf(other)[channelId]) return { ok: false, reason: `That channel is already a ${other} channel. Remove it there first.` };
  const saved = store.getMeta(KINDS[kind].key) ?? {};
  store.setMeta(KINDS[kind].key, { ...saved, [channelId]: prefix.toUpperCase() });
  return { ok: true };
}

function removeChannel(kind, channelId) {
  const saved = store.getMeta(KINDS[kind].key) ?? {};
  if (channelId in saved) {
    const { [channelId]: _gone, ...rest } = saved;
    store.setMeta(KINDS[kind].key, rest);
    return { ok: true };
  }
  if (KINDS[kind].env()[channelId]) return { ok: false, reason: 'That channel is set in the .env file. Remove it from there and restart the bot.' };
  return { ok: false, reason: 'That channel is not in the list.' };
}

const listChannels = (kind) => channelsOf(kind);

const enabled = config.messageContent;
if ((Object.keys(config.schematic.channels).length || Object.keys(config.schematic.boosterChannels).length) && !enabled) {
  console.warn('Schematic channels are set but MESSAGE_CONTENT_INTENT is not true, so schematic posting is off.');
}

const isImage = (a) => a.contentType?.startsWith('image/');

// Owner or COMMAND_ROLE_ID only, same as every other command
const canPost = (message) => Boolean(
  message.author.id === config.targetId
  || (config.commandRoleId && message.member?.roles?.cache?.has(config.commandRoleId)),
);

// "mega_castle.litematic" -> "mega castle"
const cleanName = (file) => file.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

// Mentions stay mentions. Typed names become a mention when they exactly match a known member, else plain text.
function parseOwners(message) {
  const owners = [];
  for (const piece of message.content.split(/(<@[!&]?\d+>)/)) {
    if (/^<@[!&]?\d+>$/.test(piece)) { owners.push(piece.replace('<@!', '<@')); continue; }
    for (const raw of piece.split(/[,&\n]|\band\b/i)) {
      const name = raw.trim().replace(/^@/, '').slice(0, 50);
      if (!name) continue;
      const lower = name.toLowerCase();
      const member = message.guild.members.cache.find((m) => m.user.username.toLowerCase() === lower || m.displayName.toLowerCase() === lower);
      owners.push(member ? `<@${member.id}>` : name);
    }
  }
  return [...new Set(owners)].slice(0, 10);
}

function buildText({ name, tag, owners, size, booster = false }) {
  return [
    `**${E.warn}**  __**DO NOT SHARE THESE SCHEMATICS**__ **${E.warn}**`,
    `#           ${E.build}  **${name}**  ${E.build}`,
    `${E.brand} **${booster ? config.schematic.boosterBrand : config.schematic.brand}**`,
    '',
    `__***BUILD NUMBER: ${tag}***__`,
    `_**Size =**_ ${size}`,
    `*${booster ? BOOSTER_NOTE : WARNING}*`,
    ` Original Creator: ${owners.join(' & ')}`,
  ].join('\n');
}

async function fail(message, text) {
  const reply = await message.reply({ content: `❌ ${text}`, allowedMentions: { repliedUser: false } }).catch(() => null);
  if (reply) setTimeout(() => reply.delete().catch(() => {}), 15000);
}

async function run(message) {
  if (!enabled || message.author.bot || !message.guild || !message.reference?.messageId) return;
  const where = prefixOf(message.channelId);
  if (!where || !canPost(message)) return;
  const { kind, prefix } = where;
  const booster = kind === 'booster';

  const original = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  // A reply to something without attachments is just normal chat: ignore it
  if (!original || original.author.bot || original.attachments.size === 0) return;

  const atts = [...original.attachments.values()];
  const images = atts.filter(isImage);
  const schems = atts.filter((a) => !isImage(a));
  if (booster && !images.length) return fail(message, 'That message has no pictures. Attach the pictures (and the schematic file for the size), then reply to it again.');
  if (!booster && !schems.length) return fail(message, 'That message has no schematic file. Attach the schematic (and the pictures), then reply to it again.');

  const owners = parseOwners(message);
  if (!owners.length) return fail(message, 'Who made it? Mention the owner(s) or type their name(s) in your reply. Use a comma or & for several.');

  const name = original.content.split('\n')[0].trim().slice(0, 100) || (schems[0] ? cleanName(schems[0].name) : 'Build');
  const counters = store.getMeta('schemCounters') ?? {};
  const number = (counters[prefix] ?? 0) + 1;
  const tag = `${prefix}${number}`;

  let imageFiles;
  let schemFiles;
  try {
    imageFiles = await Promise.all(images.map((a, i) => toFile(a, `image${i + 1}`)));
    schemFiles = await Promise.all(schems.map((a) => toFile(a, 'schematic', true)));
  } catch (err) {
    console.error(err);
    return fail(message, 'Could not download the files. Please try again.');
  }

  // Size comes from the schematic file(s). Booster posts read it but never re-post the file.
  const size = schemFiles.length ? schemFiles.map((f) => describeSize(f.attachment)).join(' | ') : 'Unknown';
  const files = booster ? imageFiles : [...imageFiles, ...schemFiles];

  try {
    // No pings: the owners were already pinged by your reply
    await message.channel.send({ content: buildText({ name, tag, owners, size, booster }), files, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(err);
    return fail(message, 'Could not post it. I need Send Messages and Attach Files here (and the files must fit the upload limit).');
  }

  store.setMeta('schemCounters', { ...counters, [prefix]: number });
  const results = await Promise.allSettled([original.delete(), message.delete()]);
  if (results.some((r) => r.status === 'rejected')) console.warn('Could not delete the original messages. Give the bot Manage Messages in the schematic channel.');
}

// One at a time, so two quick posts never get the same number
let chain = Promise.resolve();
function handle(message) {
  chain = chain.then(() => run(message)).catch((err) => console.error('Schematic post failed:', err));
  return chain;
}

module.exports = { handle, buildText, parseOwners, addChannel, removeChannel, listChannels, formatBytes };
