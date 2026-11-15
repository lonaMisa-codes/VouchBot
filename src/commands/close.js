const { SlashCommandBuilder } = require('discord.js');
const { closeCommand } = require('../tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ticket (use inside a ticket channel)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('reason').setDescription('Why the ticket is being closed (optional)').setMaxLength(500)),

  execute: closeCommand,
};
