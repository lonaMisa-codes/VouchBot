const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const { ownerOnly } = require('../owner');
const { publish } = require('../post');
const { parsePrice, money } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveawayvouch')
    .setDescription('Owner: post a giveaway vouch')
    .addStringOption((o) => o.setName('amount').setDescription('How much the giveaway was, e.g. 5m').setRequired(true).setMaxLength(50))
    .addAttachmentOption((o) => o.setName('vouch').setDescription('Picture of the winner\'s vouch').setRequired(true))
    .addAttachmentOption((o) => o.setName('proof').setDescription('Proof of paying the winner').setRequired(true)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const raw = i.options.getString('amount');
    const value = parsePrice(raw); // null if it is free text, then it is shown as typed
    return publish(i, {
      title: '🎁 Giveaway Vouch',
      proofTitle: 'Proof of payment',
      fields: [{ name: 'Giveaway', value: value ? money(value) : raw, inline: true }],
      vouch: i.options.getAttachment('vouch'),
      proof: i.options.getAttachment('proof'),
      categoryId: config.channels.giveaway,
      record: { kind: 'giveaway', value },
    });
  },
};
