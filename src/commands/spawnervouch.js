const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const { ownerOnly } = require('../owner');
const { publish } = require('../post');
const { parsePrice, money } = require('../utils');

const SPAWNER = config.SPAWNERS[0];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawnervouch')
    .setDescription('Owner: post a spawner vouch')
    .addStringOption((o) => o.setName('trade').setDescription('Did the customer buy from you or sell to you?').setRequired(true)
      .addChoices({ name: 'Customer bought from me', value: 'buy' }, { name: 'Customer sold to me', value: 'sell' }))
    .addStringOption((o) => o.setName('value').setDescription('Total trade value, e.g. 3.44b, 250m').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many spawners').setRequired(true).setMinValue(1).setMaxValue(1000000))
    .addAttachmentOption((o) => o.setName('vouch').setDescription('Picture of the vouch').setRequired(true))
    .addAttachmentOption((o) => o.setName('proof').setDescription('Proof of the trade / transaction').setRequired(true)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const value = parsePrice(i.options.getString('value'));
    if (!value) return i.editReply('Invalid value. Use formats like `500k`, `3.44b`, `1500000`.');

    const side = i.options.getString('trade');
    const count = i.options.getInteger('amount');
    return publish(i, {
      title: '💀 Spawner Vouch',
      fields: [
        { name: 'Trade value', value: money(value), inline: true },
        { name: 'Trade', value: side === 'buy' ? '🛒 Bought from me' : '💰 Sold to me', inline: true },
        { name: 'Spawners', value: `${count.toLocaleString('en-US')}× ${SPAWNER}`, inline: true },
      ],
      vouch: i.options.getAttachment('vouch'),
      proof: i.options.getAttachment('proof'),
      categoryId: config.channels.spawner,
      record: { kind: 'spawner', side, spawner: SPAWNER, count, value },
    });
  },
};
