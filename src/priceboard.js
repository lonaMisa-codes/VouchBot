const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const store = require('./store');
const { money } = require('./utils');
const { panel } = require('./tickets');

const prices = () => store.getMeta('prices') ?? {};
const get = (type = config.SPAWNERS[0]) => prices()[type] ?? null;

// buy = price customers pay when they BUY from me ("I SELL TO YOU")
// sell = price I pay when they SELL to me ("YOU SELL TO ME")
function set(type, buy, sell, by) {
  store.setMeta('prices', { ...prices(), [type]: { buy, sell } });
  store.setMeta('priceUpdate', { by, at: Date.now() });
}

function embed() {
  const p = prices();
  const types = config.SPAWNERS.filter((t) => p[t]);
  const lines = (key) => types.map((t) => `${t} Spawner — **${money(p[t][key])}** each`).join('\n') || '—';
  const upd = store.getMeta('priceUpdate') ?? {};

  return new EmbedBuilder()
    .setColor(config.COLORS.vouch)
    .setTitle('Spawner Prices')
    .setDescription(`**🛒 I SELL TO YOU**\n${lines('buy')}\n\n**💰 YOU SELL TO ME**\n${lines('sell')}\n\n**Want to trade?**\nPress a button below to open a ticket.`)
    .setFooter({ text: `Last updated by ${upd.by ?? 'Unknown'}` })
    .setTimestamp(upd.at ? new Date(upd.at) : new Date());
}

// The Buy / Sell Spawners buttons from the spawner ticket panel (they open the ticket form)
const buttons = () => panel('spawner').components;

/**
 * Updates the posted panel. Editing goes straight to the message ID (no fetch), so it works
 * without Read Message History. If the old panel can't be edited or is gone, a new panel is
 * posted in fallbackChannel. Returns { status: 'updated' | 'posted', problem }.
 */
async function sync(client, fallbackChannel) {
  const ref = store.getMeta('pricePanel');
  let problem = null;
  if (ref) {
    try {
      const ch = await client.channels.fetch(ref.channelId);
      await ch.messages.edit(ref.messageId, { embeds: [embed()], components: buttons() });
      return { status: 'updated', problem: null };
    } catch (err) {
      if (err.code !== 10008 && err.code !== 10003) problem = err.message; // not just "panel was deleted"
      console.error('Price panel edit failed:', err.message);
    }
  }
  const msg = await fallbackChannel.send({ embeds: [embed()], components: buttons() });
  store.setMeta('pricePanel', { channelId: msg.channelId, messageId: msg.id });
  return { status: 'posted', problem };
}

module.exports = { get, set, embed, sync };
