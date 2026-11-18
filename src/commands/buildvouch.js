const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const { ownerOnly } = require('../owner');
const { publish } = require('../post');
const { parsePrice, money } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buildvouch')
    .setDescription('Owner: post a build / base vouch')
    .addStringOption((o) => o.setName('trade').setDescription('Did the customer buy from you or sell to you?').setRequired(true)
      .addChoices({ name: 'Customer bought from me', value: 'buy' }, { name: 'Customer sold to me', value: 'sell' }))
    .addStringOption((o) => o.setName('value').setDescription('Total trade value, e.g. 3.44b, 250m').setRequired(true))
    .addAttachmentOption((o) => o.setName('vouch').setDescription('Picture of the vouch').setRequired(true))
    .addAttachmentOption((o) => o.setName('proof').setDescription('Proof of the trade / transaction (optional)').setRequired(false))
    .addAttachmentOption((o) => o
      .setName('schem')
      .setDescription('Litematica schematic file (.litematic) - optional')
      .setRequired(false)
    ),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    
    const value = parsePrice(i.options.getString('value'));
    if (!value) return i.editReply('Invalid value. Use formats like `500k`, `3.44b`, `1500000`.');

    const side = i.options.getString('trade');
    const schemAttachment = i.options.getAttachment('schem');

    if (schemAttachment) {
      const name = schemAttachment.name?.toLowerCase() || '';
      if (!name.endsWith('.litematic')) {
        return i.editReply('Schematic must be a `.litematic` file.');
      }
    }

    return publish(i, {
      title: '🏗️ Build Vouch',
      proofTitle: 'Proof of base',
      fields: [
        { name: 'Trade value', value: money(value), inline: true },
        { name: 'Trade', value: side === 'buy' ? '🛒 Bought from me' : '💰 Sold to me', inline: true },
        ...(schemAttachment ? [{ name: 'Schematic', value: `\`${schemAttachment.name}\``, inline: true }] : []),
      ],
      vouch: i.options.getAttachment('vouch'),
      proof: i.options.getAttachment('proof'),
      schem: schemAttachment,
      categoryId: config.channels.build,
      record: { 
        kind: 'build', 
        side, 
        schem: schemAttachment?.name || null, 
        value 
      },
    });
  },
};
