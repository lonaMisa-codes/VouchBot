const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags,
} = require('discord.js');
const { ownerOnly } = require('../owner');
const schematics = require('../schematics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schematicremove')
    .setDescription('Owner: remove a posted schematic; later builds with the same prefix move down by one')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('build').setDescription('The build number to remove, e.g. B3 or BB1').setRequired(true).setMaxLength(10)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const tag = i.options.getString('build').trim().toUpperCase();
    const rec = schematics.postInfo(tag);
    if (!rec) return i.editReply(`No schematic post with build number \`${tag}\`. Only posts made after schematic tracking was added can be removed.`);

    const later = schematics.laterCount(tag);
    const link = `https://discord.com/channels/${i.guildId}/${rec.c}/${rec.m}`;
    const prompt = await i.editReply({
      content: `⚠️ **Remove ${rec.b ? 'booster ' : ''}schematic ${tag} (${rec.n})?**\n${link}\nThe post is deleted and the ${later} later build${later === 1 ? '' : 's'} with the same prefix move down by one (their posts get edited). This cannot be undone. Confirm within 30 seconds.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('schematicremove:yes').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('schematicremove:no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      )],
    });

    let press;
    try {
      press = await prompt.awaitMessageComponent({ componentType: ComponentType.Button, filter: (b) => b.user.id === i.user.id, time: 30_000 });
    } catch {
      return i.editReply({ content: '⌛ Timed out. Nothing was removed.', components: [] });
    }
    if (press.customId !== 'schematicremove:yes') return press.update({ content: '❌ Cancelled. Nothing was removed.', components: [] });

    await press.update({ content: 'Removing...', components: [] });
    const r = await schematics.removePost(i.client, tag);
    if (!r.ok) return i.editReply(`❌ ${r.reason}`).catch(() => {});
    const text = r.failed.length
      ? `✅ Removed ${tag}. ⚠️ Could not edit ${r.failed.length} post${r.failed.length === 1 ? '' : 's'} (the numbers are saved, the text is old):\n${r.failed.slice(0, 8).map((f) => `• ${f}`).join('\n')}\nFix each with \`/schematicedit build:<new number> name:<same name>\` once the bot has access.`
      : `✅ Removed ${tag} and moved ${r.moved.length} later build${r.moved.length === 1 ? '' : 's'} down by one.`;
    return i.editReply(text).catch(() => {});
  },
};
