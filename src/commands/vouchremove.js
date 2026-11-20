const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags,
} = require('discord.js');
const store = require('../store');
const { ownerOnly } = require('../owner');

const LABEL = { spawner: 'Spawner', build: 'Build', giveaway: 'Giveaway', total: 'Total' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vouchremove')
    .setDescription('Owner: remove a vouch (deletes its posts and frees its number)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('type').setDescription('Which number you are giving').setRequired(true)
      .addChoices(...Object.entries(LABEL).map(([value, name]) => ({ name: value === 'total' ? 'Total (all-vouches number)' : name, value }))))
    .addIntegerOption((o) => o.setName('number').setDescription('The vouch number, e.g. 31').setRequired(true).setMinValue(1)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const type = i.options.getString('type');
    const n = i.options.getInteger('number');
    const v = store.findByNumber(type, n);
    if (!v) return i.editReply(`No vouch found with ${LABEL[type]} number ${n}.`);

    const link = v.messages?.[0] ? `https://discord.com/channels/${i.guildId}/${v.messages[0].channelId}/${v.messages[0].messageId}` : null;
    const buttons = (disabled = false) => [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vouchremove:yes').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId('vouchremove:no').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    )];
    const prompt = await i.editReply({
      content: `⚠️ **Remove ${LABEL[v.kind]} vouch ${v.no} (Total ${v.total})?**${link ? `\n${link}` : ''}\nIts posts are deleted and the numbers ${LABEL[v.kind]} ${v.no} and Total ${v.total} are used again by the next vouch. This cannot be undone. Confirm within 30 seconds.`,
      components: buttons(),
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
    store.remove(v.id); // also refreshes the summary panel
    return i.editReply(`🗑️ Removed ${LABEL[v.kind]} vouch ${v.no} (Total ${v.total}). The next vouch will use those numbers.`);
  },
};
