const { SlashCommandBuilder } = require('discord.js');
const { command } = require('../tickets');

// Claim / unclaim / add, same as the ticket buttons (closing is /close), usable from anywhere in the ticket channel
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket controls: claim, unclaim, add (inside a ticket channel)')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('claim').setDescription('Claim this ticket (staff)'))
    .addSubcommand((s) => s.setName('unclaim').setDescription('Unclaim this ticket'))
    .addSubcommand((s) => s.setName('add').setDescription('Add someone to this ticket (staff)')
      .addUserOption((o) => o.setName('user').setDescription('Who to add').setRequired(true))),

  execute: command,
};
