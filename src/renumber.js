const { MessageFlags } = require('discord.js');

// Vouch posts are Components V2 cards. To change the number in one, we take the card as Discord returns it,
// change only the "## Build - 12  •  Total - 140" line, and send it back keeping the same attachments.

const HEADING = /^## (Spawner|Build|Giveaway) - \d+(  •  Total - \d+)?$/;

// Media URLs come back as signed CDN links; send them back as attachment://name so the kept attachment is used.
const asAttachmentRef = (url) => {
  try { return `attachment://${decodeURIComponent(new URL(url).pathname.split('/').pop())}`; } catch { return url; }
};

// Pure function on the raw component JSON: returns { components, changed }
function renumberComponents(components, no, total) {
  let changed = false;
  const walk = (c) => {
    const out = { ...c };
    if (c.type === 10 && HEADING.test(c.content ?? '')) { // text display
      const m = c.content.match(HEADING);
      const text = `## ${m[1]} - ${no}${m[2] ? `  •  Total - ${total}` : ''}`;
      if (text !== c.content) { out.content = text; changed = true; }
    } else if (c.type === 12) { // media gallery
      out.items = c.items.map((it) => ({ ...it, media: { url: asAttachmentRef(it.media.url) } }));
    } else if (c.type === 13) { // file
      const { name: _n, size: _s, ...rest } = out;
      return { ...rest, file: { url: asAttachmentRef(c.file.url) } };
    } else if (Array.isArray(c.components)) { // container
      out.components = c.components.map(walk);
    }
    return out;
  };
  return { components: components.map(walk), changed };
}

// Edits the posts of the given vouch records to their current numbers. Returns the posts that could not be edited.
async function refreshPosts(client, records) {
  const failed = [];
  for (const v of records) {
    for (const ref of v.messages ?? []) {
      try {
        const msg = await client.channels.fetch(ref.channelId).then((c) => c.messages.fetch(ref.messageId));
        const { components, changed } = renumberComponents(msg.components.map((c) => c.toJSON()), v.no, v.total);
        if (!changed) continue;
        await msg.edit({
          components,
          attachments: [...msg.attachments.values()].map((a) => ({ id: a.id })),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        });
      } catch (err) {
        console.error(`Could not renumber post ${ref.messageId}:`, err.message);
        failed.push(`${v.kind} ${v.no} (Total ${v.total}): ${String(err.message).slice(0, 150)}`);
        break;
      }
    }
  }
  return failed;
}

module.exports = { renumberComponents, refreshPosts };
