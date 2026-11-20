const {
  AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MediaGalleryBuilder, MediaGalleryItemBuilder, FileBuilder, MessageFlags,
} = require('discord.js');
const config = require('./config');
const store = require('./store');

async function resolveChannel(client, id, fallback) {
  if (!id) return fallback;
  try {
    const ch = await client.channels.fetch(id);
    return ch?.isTextBased() ? ch : null;
  } catch {
    return null;
  }
}

// Re-upload the file so it stays available (Discord attachment links expire).
// Images get a fixed name; a schematic keeps its own (cleaned) name so it downloads as the original.
async function toFile(att, name, keepName = false) {
  const res = await fetch(att.url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const ext = (att.name?.match(/\.[a-z0-9]+$/i) ?? ['.png'])[0];
  const fileName = keepName && att.name ? att.name.replace(/[^\w.-]+/g, '_') : `${name}${ext}`;
  return new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name: fileName });
}

const KIND_LABEL = { spawner: 'Spawner', build: 'Build', giveaway: 'Giveaway' };

/**
 * Posts a vouch as ONE card (Components V2): title, vouch number + total number, details,
 * the vouch picture, then the proof picture and the .litematic file (each only if given).
 * Sent to the all-vouches channel and, if given, the category channel.
 * The interaction must already be deferred (ephemeral). `record` is stored for /summary.
 */
async function publishNow(interaction, { title, fields, proofTitle = 'Proof of trade', vouch, proof, schem, categoryId, record }) {
  // The vouch picture is required; the proof picture and schematic are optional
  if (![vouch, proof].filter(Boolean).every((a) => a.contentType?.startsWith('image/'))) {
    return interaction.editReply('The vouch and the proof must be images (png, jpg, webp).');
  }

  const all = await resolveChannel(interaction.client, config.channels.all, interaction.channel);
  if (!all) return interaction.editReply('I cannot access the all-vouches channel. Check ALL_VOUCHES_CHANNEL_ID and my permissions.');

  const targets = [all];
  if (categoryId && categoryId !== all.id) {
    const ch = await resolveChannel(interaction.client, categoryId, null);
    if (ch) targets.push(ch);
    else console.warn(`Cannot access channel ${categoryId}`);
  }

  let vouchFile;
  let proofFile = null;
  let schemFile = null;
  try {
    vouchFile = await toFile(vouch, 'vouch');
    if (proof) proofFile = await toFile(proof, 'proof');
    if (schem) schemFile = await toFile(schem, 'schematic', true);
  } catch (err) {
    console.error(err);
    return interaction.editReply('Could not download the files. Please try again.');
  }
  const files = [vouchFile, proofFile, schemFile].filter(Boolean);

  // Numbers: the lowest free one, so the number of a removed vouch is used again ("Build - 12 | Total - 140")
  const { no: kindNo, total: totalNo } = store.nextNumbers(record.kind);

  const color = record.kind === 'giveaway' ? config.COLORS.gold : config.COLORS.vouch;
  const text = (t) => new TextDisplayBuilder().setContent(t);
  const gap = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
  const picture = (file) => new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${file.name}`));

  // "Total" only appears in the all-vouches channel; the other channels show just the category number
  const makePayload = (withTotal) => {
    const card = new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(
        text(`# ${title}`),
        text(`## ${KIND_LABEL[record.kind]} - ${kindNo}${withTotal ? `  •  Total - ${totalNo}` : ''}`),
      )
      .addSeparatorComponents(gap())
      .addTextDisplayComponents(text(fields.map((f) => `**${f.name}:** ${f.value}`).join('\n')))
      .addSeparatorComponents(gap())
      .addTextDisplayComponents(text('**Proof of vouch**'))
      .addMediaGalleryComponents(picture(vouchFile));

    if (proofFile) {
      card.addTextDisplayComponents(text(`**${proofTitle}**`)).addMediaGalleryComponents(picture(proofFile));
    }
    if (schemFile) {
      card.addTextDisplayComponents(text('**Schematic**'))
        .addFileComponents(new FileBuilder().setURL(`attachment://${schemFile.name}`));
    }
    card.addTextDisplayComponents(text(`-# <t:${Math.floor(Date.now() / 1000)}:F>`));
    return { components: [card], files, flags: MessageFlags.IsComponentsV2 };
  };

  const sent = [];
  for (const ch of targets) {
    try {
      const msg = await ch.send(makePayload(ch.id === all.id));
      sent.push({ channelId: ch.id, messageId: msg.id, url: msg.url });
    } catch (err) {
      console.error(`Failed posting to ${ch.id}:`, err.message);
    }
  }

  // The all-vouches post is the main one: if it failed, undo the rest
  if (!sent.length || sent[0].channelId !== all.id) {
    for (const s of sent) await interaction.client.channels.fetch(s.channelId).then((c) => c.messages.delete(s.messageId)).catch(() => {});
    return interaction.editReply('Failed to post the vouch. Make sure I can send messages, embed links and attach files there (and that the files are not too large).');
  }

  store.add({ ...record, no: kindNo, total: totalNo, messages: sent.map(({ channelId, messageId }) => ({ channelId, messageId })) });
  return interaction.editReply(`Posted: ${sent[0].url}`);
}

// One vouch at a time, so two quick vouches never get the same number
let chain = Promise.resolve();
function publish(...args) {
  const result = chain.then(() => publishNow(...args));
  chain = result.catch(() => {});
  return result;
}

module.exports = { publish, toFile };
