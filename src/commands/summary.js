const { SlashCommandBuilder } = require('discord.js');
const store = require('../store');
const { ownerOnly } = require('../owner');
const board = require('../summaryboard');

module.exports = {
  data: new SlashCommandBuilder().setName('summary').setDescription('Owner: post the live vouch summary panel (updates by itself)'),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    const old = store.getMeta('summaryPanel');
    await i.reply({ embeds: [board.embed()] });
    const msg = await i.fetchReply();
    store.setMeta('summaryPanel', { channelId: msg.channelId, messageId: msg.id });

    // Only one live panel: remove the previous one
    if (old) i.client.channels.fetch(old.channelId).then((c) => c.messages.delete(old.messageId)).catch(() => {});
  },
};
