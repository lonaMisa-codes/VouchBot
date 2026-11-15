const {
  AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
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

// Re-upload the image so it stays visible (Discord attachment links expire).
async function toFile(att, name) {
  const res = await fetch(att.url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const ext = (att.name?.match(/\.[a-z0-9]+$/i) ?? ['.png'])[0];
  return new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name: `${name}${ext}` });
}

const KIND_LABEL = { spawner: 'Spawner', build: 'Build', giveaway: 'Giveaway' };

/**
 * Posts a vouch as ONE card (Components V2): title, vouch number + total number, details,
 * the vouch picture, then the proof picture. Sent to the all-vouches channel and, if given,
 * the category channel. The interaction must already be deferred (ephemeral).
 * `record` is stored for /summary.
 */
async function publish(interaction, { title, fields, proofTitle = 'Proof of trade', vouch, proof, categoryId, record }) {
  if (![vouch, proof].every((a) => a.contentType?.startsWith('image/'))) {
    return interaction.editReply('Both the vouch and the proof must be images (png, jpg, webp).');
  }

  const all = await resolveChannel(interaction.client, config.channels.all, interaction.channel);
  if (!all) return interaction.editReply('I cannot access the all-vouches channel. Check ALL_VOUCHES_CHANNEL_ID and my permissions.');

  const targets = [all];
  if (categoryId && categoryId !== all.id) {
    const ch = await resolveChannel(interaction.client, categoryId, null);
    if (ch) targets.push(ch);
    else console.warn(`Cannot access channel ${categoryId}`);
  }

  let files;
  try {
    files = [await toFile(vouch, 'vouch'), await toFile(proof, 'proof')];
  } catch (err) {
    console.error(err);
    return interaction.editReply('Could not download the images. Please try again.');
  }

  // Counters include this vouch: "Build - 12 | Total - 140"
  const all_ = store.all();
  const kindNo = all_.filter((v) => v.kind === record.kind).length + 1;
  const totalNo = all_.length + 1;

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
      .addMediaGalleryComponents(picture(files[0]))
      .addTextDisplayComponents(text(`**${proofTitle}**`))
      .addMediaGalleryComponents(picture(files[1]))
      .addTextDisplayComponents(text(`-# <t:${Math.floor(Date.now() / 1000)}:F>`));
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
    return interaction.editReply('Failed to post the vouch. Make sure I can send messages, embed links and attach files there.');
  }

  store.add({ ...record, messages: sent.map(({ channelId, messageId }) => ({ channelId, messageId })) });
  return interaction.editReply(`Posted: ${sent[0].url}`);
}

module.exports = { publish };
