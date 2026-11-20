const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const store = require('../store');
const { ownerOnly } = require('../owner');
const { refreshPosts } = require('../renumber');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vouchfix')
    .setDescription('Owner: re-edit vouch posts so their numbers match (use after a failed renumber)')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('number').setDescription('Only fix this Total number (default: all vouches)').setMinValue(1)),

  async execute(i) {
    if (!(await ownerOnly(i))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const n = i.options.getInteger('number');
    const records = n ? [store.findByNumber('total', n)].filter(Boolean) : store.all();
    if (!records.length) return i.editReply(n ? `No vouch found with Total number ${n}.` : 'There are no vouches yet.');
    // Posts that already show the right number are skipped, so this is safe to run any time
    const failed = await refreshPosts(i.client, records);
    return i.editReply(failed.length
      ? `⚠️ Could not edit ${failed.length} post${failed.length === 1 ? '' : 's'}:\n${failed.slice(0, 8).map((f) => `• ${f}`).join('\n')}`
      : `✅ Checked ${records.length} vouch${records.length === 1 ? '' : 'es'}. All posts show the right numbers.`);
  },
};
