const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const board = require('./priceboard');
const { money, stacks } = require('./utils');

// Builds /spawnerbuy and /spawnersell: amount x current price from the price panel.
function makeCalc({ name, description, side, title }) {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .addIntegerOption((o) => o.setName('amount').setDescription('How many spawners').setRequired(true).setMinValue(1).setMaxValue(10000000)),

    async execute(i) {
      const p = board.get();
      if (!p) return i.reply({ content: 'Prices are not set yet.', flags: MessageFlags.Ephemeral });
      const amount = i.options.getInteger('amount');
      const each = side === 'buy' ? p.buy : p.sell;

      return i.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle(`🧱 ${title}`)
          .addFields(
            { name: 'Amount', value: `**${amount.toLocaleString('en-US')}** spawners\n(${stacks(amount)})`, inline: true },
            { name: 'Price each', value: `**${money(each)}**`, inline: true },
            { name: 'Total', value: `**${money(amount * each)}**` },
          )
          .setFooter({ text: 'Prices fetched live from the price panel' })
          .setTimestamp()],
      });
    },
  };
}

module.exports = { makeCalc };
