const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ownerOnly } = require('../owner');
const schematics = require('../schematics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schematicedit')
    .setDescription('Owner: edit a posted schematic (name, creator, build number or size)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('build').setDescription('The build number of the post to edit, e.g. B3 or BB1').setRequired(true).setMaxLength(10))
    .addStringOption((o) => o.setName('name').setDescription('New build name').setMaxLength(100))
    .addStringOption((o) => o.setName('creator').setDescription('New creator(s): mention or type names, separate with comma or &').setMaxLength(200))
    .addStringOption((o) => o.setName('number').setDescription('New build number, e.g. B12 or BB3').setMaxLength(10))
    .addStringOption((o) => o.setName('size').setDescription('New size text, e.g. 120 x 64 x 97').setMaxLength(60)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    const changes = {
      name: i.options.getString('name'),
      creator: i.options.getString('creator'),
      number: i.options.getString('number'),
      size: i.options.getString('size'),
    };
    if (!Object.values(changes).some(Boolean)) {
      return i.reply({ content: 'Nothing to change. Fill in at least one of: name, creator, number, size.', flags: MessageFlags.Ephemeral });
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await schematics.editPost(i.client, i.guild, i.options.getString('build'), changes);
    return i.editReply(r.ok ? `✅ Updated \`${r.tag}\`: ${r.url}` : r.reason);
  },
};
