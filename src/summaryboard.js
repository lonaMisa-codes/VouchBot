const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const store = require('./store');
const { money } = require('./utils');

const sum = (rows, key) => rows.reduce((n, v) => n + (v[key] ?? 0), 0);
const m = (n) => (n ? money(n) : '—');
const when = (v) => `<t:${Math.floor(v.createdAt / 1000)}:R>`;
const said = (v) => (v.side === 'buy' ? 'bought' : 'sold');
const recent = (rows, line) => rows.slice(-3).reverse().map((v) => `• ${line(v)} ${when(v)}`).join('\n') || '_None yet_';

const LINE = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';

// One panel. Section titles use big headings (##), key numbers use medium headings (###).
function embed() {
  const rows = store.all();
  const of = (kind) => rows.filter((v) => v.kind === kind);
  const sp = of('spawner');
  const bd = of('build');
  const gw = of('giveaway');
  const bySide = (arr, side) => m(sum(arr.filter((v) => v.side === side), 'value'));
  const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

  const description = [
    '## 👤 Overview',
    `**User:** ${config.targetId ? `<@${config.targetId}>` : '—'}   •   **IGN:** \`${config.ownerIgn}\``,
    `### 🧾 Total vouches: ${rows.length}`,
    `### 💰 Total traded: ${m(sum([...sp, ...bd], 'value'))}`,
    LINE,
    '## 💀 Spawners',
    `### ${plural(sp.length, 'vouch')} • ${sum(sp, 'count').toLocaleString('en-US')} spawners`,
    `**Money:** ${m(sum(sp, 'value'))}`,
    `**Bought from me:** ${bySide(sp, 'buy')}`,
    `**Sold to me:** ${bySide(sp, 'sell')}`,
    '**Recent**',
    recent(sp, (v) => `${(v.count ?? 0).toLocaleString('en-US')}× ${v.spawner ?? 'Skeleton'} — ${m(v.value)} (${said(v)})`),
    LINE,
    '## 🏗️ Builds',
    `### ${plural(bd.length, 'vouch')}`,
    `**Money:** ${m(sum(bd, 'value'))}`,
    `**Bought from me:** ${bySide(bd, 'buy')}`,
    `**Sold to me:** ${bySide(bd, 'sell')}`,
    '**Recent**',
    recent(bd, (v) => `${v.schem ?? 'Build'} — ${m(v.value)} (${said(v)})`),
    LINE,
    '## 🎁 Giveaways',
    `### ${plural(gw.length, 'vouch')}`,
    `**Total paid:** ${m(sum(gw, 'value'))}`,
    '**Recent**',
    recent(gw, (v) => `${m(v.value)} giveaway`),
  ].join('\n');

  return new EmbedBuilder()
    .setColor(config.COLORS.info)
    .setTitle('📊 Vouch Summary')
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: 'Updates automatically' })
    .setTimestamp();
}

// Edits the live panel by message ID (no fetch needed). Calls are queued so edits never race.
let chain = Promise.resolve();
function refresh(client) {
  chain = chain.then(async () => {
    const ref = store.getMeta('summaryPanel');
    if (!ref) return;
    try {
      const ch = await client.channels.fetch(ref.channelId);
      await ch.messages.edit(ref.messageId, { embeds: [embed()] });
    } catch (err) {
      if (err.code === 10008 || err.code === 10003) store.setMeta('summaryPanel', null); // panel was deleted
      else console.error('Summary refresh failed:', err.message);
    }
  });
  return chain;
}

module.exports = { embed, refresh };
