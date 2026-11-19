const config = require('./config');
const store = require('./store');
const { toFile } = require('./post');
const { describeSize } = require('./litematic');

// Schematic posting. Two kinds of channel:
//  - posting channel: the bot re-posts the pictures AND the schematic file (build number like B1)
//  - booster channel: the bot re-posts the pictures ONLY, with the booster text (build number like BB1)
// In either one: send ONE message with the pictures + the schematic file. The first line of your text is the
// build name (the file name is used if you leave it empty). The bot posts it right away, credited to the bot
// owner (VOUCH_TARGET_ID), or to whoever you @mention in the message, and removes your message.
// Fix anything later with /schematicedit. Needs the Message Content intent (MESSAGE_CONTENT_INTENT=true)
// and Manage Messages in those channels. Channels come from .env and from /schematicchannel and /boosterchannel.
// Only a tiny text record per post is stored (message id + name / creator / size), never the files.

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
// Several: comma, & or "and".
function parseOwnersText(text, guild) {
  const owners = [];
  for (const piece of text.split(/(<@[!&]?\d+>)/)) {
    if (/^<@[!&]?\d+>$/.test(piece)) { owners.push(piece.replace('<@!', '<@')); continue; }
    for (const raw of piece.split(/[,&\n]|\band\b/i)) {
      const name = raw.trim().replace(/^@/, '').slice(0, 50);
      if (!name) continue;
      const lower = name.toLowerCase();
      const member = guild?.members.cache.find((m) => m.user.username.toLowerCase() === lower || m.displayName.toLowerCase() === lower);
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

const MENTION = /<@!?(\d+)>/g;
const TAG = /^[A-Za-z]{1,3}\d{1,6}$/;
const posts = () => store.getMeta('schemPosts') ?? {};

async function run(message) {
  if (!enabled || message.author.bot || !message.guild || message.attachments.size === 0) return;
  const where = prefixOf(message.channelId);
  if (!where || !canPost(message)) return;
  const { kind, prefix } = where;
  const booster = kind === 'booster';

  const atts = [...message.attachments.values()];
  const images = atts.filter(isImage);
  const schems = atts.filter((a) => !isImage(a));
  if (booster && !images.length) return fail(message, 'No pictures found. Attach the pictures (and the schematic file for the size).');
  if (!booster && !schems.length) return fail(message, 'No schematic file found. Attach the schematic file together with the pictures.');

  // Credit: whoever you @mention, otherwise the bot owner
  const mentioned = [...new Set([...message.content.matchAll(MENTION)].map((m) => `<@${m[1]}>`))].slice(0, 10);
  const owners = mentioned.length ? mentioned : [config.targetId ? `<@${config.targetId}>` : 'Unknown'];
  const firstLine = message.content.replace(MENTION, '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const name = firstLine.slice(0, 100) || (schems[0] ? cleanName(schems[0].name) : 'Build');

  const counters = store.getMeta('schemCounters') ?? {};
  const all = posts();
  let number = (counters[prefix] ?? 0) + 1;
  while (all[`${prefix}${number}`]) number++; // never reuse a number you set by hand
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

  // The size comes from the schematic file(s). Booster posts read it but never re-post the file.
  const size = schemFiles.length ? schemFiles.map((f) => describeSize(f.attachment)).join(' | ') : 'Unknown';
  const files = booster ? imageFiles : [...imageFiles, ...schemFiles];

  let sent;
  try {
    // No pings: people you mention were already pinged by your message
    sent = await message.channel.send({ content: buildText({ name, tag, owners, size, booster }), files, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(err);
    return fail(message, 'Could not post it. I need Send Messages and Attach Files here (and the files must fit the upload limit).');
  }

  store.setMeta('schemCounters', { ...counters, [prefix]: number });
  store.setMeta('schemPosts', { ...all, [tag]: { c: message.channelId, m: sent.id, n: name, o: owners, s: size, b: booster ? 1 : 0 } });
  await message.delete().catch(() => console.warn('Could not delete your message. Give the bot Manage Messages in the schematic channel.'));
}

// Edit a post made earlier. changes: { name, creator, number, size } (all optional).
async function editPost(client, guild, tagInput, changes) {
  const tag = tagInput.trim().toUpperCase();
  const all = posts();
  const rec = all[tag];
  if (!rec) return { ok: false, reason: `No schematic post with build number \`${tag}\`. Only posts made after this feature was added can be edited.` };

  let newTag = tag;
  if (changes.number) {
    newTag = changes.number.trim().toUpperCase();
    if (!TAG.test(newTag)) return { ok: false, reason: 'The new build number must be 1-3 letters followed by a number, like `B12` or `BB3`.' };
    if (newTag !== tag && all[newTag]) return { ok: false, reason: `\`${newTag}\` is already used by another post.` };
  }

  const next = { ...rec };
  if (changes.name) next.n = changes.name.trim().slice(0, 100);
  if (changes.creator) {
    const owners = parseOwnersText(changes.creator, guild);
    if (!owners.length) return { ok: false, reason: 'I could not read the creator. Mention someone or type their name.' };
    next.o = owners;
  }
  if (changes.size) next.s = changes.size.trim().slice(0, 60);

  const msg = await client.channels.fetch(rec.c).then((c) => c.messages.fetch(rec.m)).catch(() => null);
  if (!msg) return { ok: false, reason: 'That post no longer exists (it was deleted), so it cannot be edited.' };
  try {
    await msg.edit({ content: buildText({ name: next.n, tag: newTag, owners: next.o, size: next.s, booster: !!next.b }), allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(err);
    return { ok: false, reason: 'I could not edit that message.' };
  }

  const { [tag]: _old, ...rest } = all;
  store.setMeta('schemPosts', { ...rest, [newTag]: next });
  return { ok: true, tag: newTag, url: msg.url };
}

// One at a time, so two quick posts never get the same number
let chain = Promise.resolve();
function handle(message) {
  chain = chain.then(() => run(message)).catch((err) => console.error('Schematic post failed:', err));
  return chain;
}

module.exports = { handle, buildText, parseOwnersText, addChannel, removeChannel, listChannels, editPost };
