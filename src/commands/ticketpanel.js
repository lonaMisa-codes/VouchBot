const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ownerOnly } = require('../owner');
const { panel } = require('../tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Owner: post the support ticket panel in this channel'),

  async execute(interaction) {
    if (!(await ownerOnly(interaction))) return;
    await interaction.channel.send(panel('support'));
    return interaction.reply({ content: 'Panel posted.', flags: MessageFlags.Ephemeral });
  },
};
