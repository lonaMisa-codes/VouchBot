const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const { ownerOnly } = require('../owner');
const { parsePrice, money } = require('../utils');
const board = require('../priceboard');

const SPAWNER = config.SPAWNERS[0];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spawnerprice')
    .setDescription('Owner: change the spawner buy/sell prices and update the price panel')
    .addStringOption((o) => o.setName('buy').setDescription('Price each when customers BUY from me (I SELL TO YOU), e.g. 16.2m'))
    .addStringOption((o) => o.setName('sell').setDescription('Price each when customers SELL to me (YOU SELL TO ME), e.g. 15.3m')),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    const rawBuy = i.options.getString('buy');
    const rawSell = i.options.getString('sell');
    const cur = board.get() ?? {};

    // You can change just one of them; the other keeps its current value
    const buy = rawBuy ? parsePrice(rawBuy) : cur.buy;
    const sell = rawSell ? parsePrice(rawSell) : cur.sell;
    if ((rawBuy && !buy) || (rawSell && !sell)) {
      return i.reply({ content: 'Invalid price. Use formats like `16.2m`, `16200000`, `1b`.', flags: MessageFlags.Ephemeral });
    }
    if (!buy || !sell) {
      return i.reply({ content: 'No prices set yet. Give both `buy` and `sell` the first time.', flags: MessageFlags.Ephemeral });
    }

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    board.set(SPAWNER, buy, sell, i.user.displayName);

    let note;
    try {
      const { status, problem } = await board.sync(i.client, i.channel);
      note = status === 'updated' ? 'Price panel updated.'
        : problem ? `I could not edit the old panel (${problem}), so I posted a new one here.`
          : 'No panel existed, so I posted it here.';
    } catch (err) {
      console.error(err);
      note = `Saved, but I could not post the panel here (${err.message}). I need View Channel, Send Messages and Embed Links in this channel.`;
    }
    return i.editReply(`${SPAWNER} Spawner: I sell ${money(buy)}, I buy ${money(sell)}.\n${note}`);
  },
};
