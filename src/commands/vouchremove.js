const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags,
} = require('discord.js');
const store = require('../store');
const { ownerOnly } = require('../owner');
const { refreshPosts } = require('../renumber');

const LABEL = { spawner: 'Spawner', build: 'Build', giveaway: 'Giveaway' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vouchremove')
    .setDescription('Owner: remove a vouch by its all-vouches (Total) number; later vouches move down by one')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('number').setDescription('The Total number shown in the all-vouches channel, e.g. 31').setRequired(true).setMinValue(1)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const n = i.options.getInteger('number');
    const v = store.findByNumber('total', n);
    if (!v) return i.editReply(`No vouch found with Total number ${n}.`);

    const later = store.all().filter((x) => x.total > v.total).length;
    const link = v.messages?.[0] ? `https://discord.com/channels/${i.guildId}/${v.messages[0].channelId}/${v.messages[0].messageId}` : null;
    const buttons = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vouchremove:yes').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('vouchremove:no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )];
    const prompt = await i.editReply({
      content: `⚠️ **Remove ${LABEL[v.kind]} vouch ${v.no} (Total ${v.total})?**${link ? `\n${link}` : ''}\nIts posts are deleted and the ${later} later vouch${later === 1 ? '' : 'es'} move down by one (their posts get edited). This cannot be undone. Confirm within 30 seconds.`,
      components: buttons,
    });

    let press;
    try {
      press = await prompt.awaitMessageComponent({ componentType: ComponentType.Button, filter: (b) => b.user.id === i.user.id, time: 30_000 });
    } catch {
      return i.editReply({ content: '⌛ Timed out. Nothing was removed.', components: [] });
    }
    if (press.customId !== 'vouchremove:yes') return press.update({ content: '❌ Cancelled. Nothing was removed.', components: [] });

    await press.update({ content: 'Removing...', components: [] });
    for (const m of v.messages ?? []) {
      await i.client.channels.fetch(m.channelId).then((c) => c.messages.delete(m.messageId)).catch(() => {}); // already gone is fine
    }
    const { changed } = store.removeAndRenumber(v.id); // also refreshes the summary panel
    await i.editReply(`🗑️ Removed ${LABEL[v.kind]} vouch ${v.no} (Total ${v.total}). Fixing the numbers on ${changed.length} later vouch${changed.length === 1 ? '' : 'es'}...`).catch(() => {});

    const failed = await refreshPosts(i.client, changed);
    const text = failed.length
      ? `✅ Removed. ⚠️ Could not edit ${failed.length} post${failed.length === 1 ? '' : 's'}:\n${failed.slice(0, 8).map((f) => `• ${f}`).join('\n')}\nRetry with \`/vouchfix\`.`
      : `✅ Removed ${LABEL[v.kind]} vouch ${v.no} (Total ${v.total}) and fixed the numbers on ${changed.length} later vouch${changed.length === 1 ? '' : 'es'}.`;
    return i.editReply(text).catch(() => {});
  },
};
