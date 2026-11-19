const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ownerOnly } = require('../owner');
const schematics = require('../schematics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schematicforward')
    .setDescription('Owner: re-post message(s) from another channel or server as a schematic post')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('link').setDescription('Message link(s): right-click the message > Copy Message Link. Paste several to post several').setRequired(true).setMaxLength(1500))
    .addStringOption((o) => o.setName('creator').setDescription('Credit this person instead of the original author (mention or name)').setMaxLength(200))
    .addStringOption((o) => o.setName('name').setDescription('Build name (default: the schematic file name)').setMaxLength(100)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const text = await schematics.forwardLinks(i, i.options.getString('link'), {
      creator: i.options.getString('creator'),
      name: i.options.getString('name'),
    });
    return i.editReply({ content: text.slice(0, 1900), allowedMentions: { parse: [] } });
  },
};
