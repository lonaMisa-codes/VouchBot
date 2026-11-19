const config = require('./config');
const store = require('./store');
const { toFile } = require('./post');

// Schematic posting.
// In a schematic channel, send ONE message with the pictures + the schematic file (a caption is used as the
// build name). Then REPLY to it with the owner(s): mention them, or type their names (several: comma, & or "and").
// The bot re-posts everything as one message with the info text, then removes your two messages.
// Needs the Message Content intent (MESSAGE_CONTENT_INTENT=true) and Manage Messages in those channels.

const X = '<:Xes:1572886072185192468>';
const B = '<:builder:1572886634733641849>';
const WARNING = 'Taking this schematic and reposting it in your own server without credit or permission will result in removal of access, scammer roles across partnered servers, and possible blacklist.';

const channels = config.schematic.channels;
const enabled = config.messageContent && Object.keys(channels).length > 0;
if (Object.keys(channels).length && !config.messageContent) {
  console.warn('SCHEMATIC_CHANNELS is set but MESSAGE_CONTENT_INTENT is not true, so schematic posting is off.');
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

function buildText({ name, tag, owners }) {
  return [
    `${X} DO NOT SHARE THESE SCHEMATICS ${X}`,
    ` ${B}    ${name}   ${B}`,
    '',
    config.schematic.brand,
    `BUILD NUMBER: ${tag}`,
    WARNING,
    `Original Creator: ${owners.join(' & ')}`,
  ].join('\n');
}

async function fail(message, text) {
  const reply = await message.reply({ content: `❌ ${text}`, allowedMentions: { repliedUser: false } }).catch(() => null);
  if (reply) setTimeout(() => reply.delete().catch(() => {}), 15000);
}

async function run(message) {
  if (!enabled || message.author.bot || !message.guild || !message.reference?.messageId) return;
  const prefix = channels[message.channelId];
  if (!prefix || !canPost(message)) return;

  const original = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  // A reply to something without attachments is just normal chat: ignore it
  if (!original || original.author.bot || original.attachments.size === 0) return;

  const atts = [...original.attachments.values()];
  const images = atts.filter(isImage);
  const schems = atts.filter((a) => !isImage(a));
  if (!schems.length) return fail(message, 'That message has no schematic file. Attach the schematic (and the pictures), then reply to it again.');

  const owners = parseOwners(message);
  if (!owners.length) return fail(message, 'Who made it? Mention the owner(s) or type their name(s) in your reply. Use a comma or & for several.');

  const name = original.content.split('\n')[0].trim().slice(0, 100) || cleanName(schems[0].name);
  const counters = store.getMeta('schemCounters') ?? {};
  const number = (counters[prefix] ?? 0) + 1;
  const tag = `${prefix}${number}`;

  let files;
  try {
    files = [
      ...(await Promise.all(images.map((a, i) => toFile(a, `image${i + 1}`)))),
      ...(await Promise.all(schems.map((a) => toFile(a, 'schematic', true)))),
    ];
  } catch (err) {
    console.error(err);
    return fail(message, 'Could not download the files. Please try again.');
  }

  try {
    // No pings: the owners were already pinged by your reply
    await message.channel.send({ content: buildText({ name, tag, owners }), files, allowedMentions: { parse: [] } });
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

module.exports = { handle, buildText, parseOwners };
