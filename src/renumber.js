const { AttachmentBuilder, MessageFlags } = require('discord.js');

// Vouch posts are Components V2 cards. To change the number in one, we take the card as Discord returns it,
// change only the "## Build - 12  •  Total - 140" line, and send it back. The pictures / file are re-uploaded
// with the edit under unique names and referenced as attachment://name, exactly like when the vouch was posted.

const HEADING = /^## (Spawner|Build|Giveaway) - \d+(  •  Total - \d+)?$/;

// Pure function on the raw component JSON: returns { components, changed }.
// refFor(url) turns a media / file URL into its new "attachment://name" reference.
function renumberComponents(components, no, total, refFor) {
  let changed = false;
  const walk = (c) => {
    const out = { ...c };
    if (c.type === 10 && HEADING.test(c.content ?? '')) { // text display
      const m = c.content.match(HEADING);
      const text = `## ${m[1]} - ${no}${m[2] ? `  •  Total - ${total}` : ''}`;
      if (text !== c.content) { out.content = text; changed = true; }
    } else if (c.type === 12) { // media gallery
      out.items = c.items.map((it) => ({ ...it, media: { url: refFor(it.media.url) } }));
    } else if (c.type === 13) { // file
      const { name: _n, size: _s, ...rest } = out;
      return { ...rest, file: { url: refFor(c.file.url) } };
    } else if (Array.isArray(c.components)) { // container
      out.components = c.components.map(walk);
    }
    return out;
  };
  return { components: components.map(walk), changed };
}

// Gives every attachment of a message a unique name and resolves CDN urls to attachment:// references
function makeResolver(msg) {
  const names = new Set();
  const byId = new Map(); // attachment id -> new name
  const refFor = (url) => {
    const id = /\/attachments\/\d+\/(\d+)\//.exec(url)?.[1];
    const att = id && msg.attachments.get(id);
    if (!att) throw new Error(`attachment not found for ${String(url).slice(0, 80)}`);
    if (!byId.has(id)) {
      let name = att.name;
      for (let i = 1; names.has(name); i++) name = `${i}_${att.name}`;
      names.add(name);
      byId.set(id, name);
    }
    return `attachment://${byId.get(id)}`;
  };
  return { refFor, byId };
}

// Edits the posts of the given vouch records to their current numbers. Returns the posts that could not be edited.
async function refreshPosts(client, records) {
  const failed = [];
  for (const v of records) {
    for (const ref of v.messages ?? []) {
      try {
        const msg = await client.channels.fetch(ref.channelId).then((c) => c.messages.fetch(ref.messageId));
        const { refFor, byId } = makeResolver(msg);
        const { components, changed } = renumberComponents(msg.components.map((c) => c.toJSON()), v.no, v.total, refFor);
        if (!changed) continue;
        const files = [];
        for (const [id, name] of byId) {
          const res = await fetch(msg.attachments.get(id).url);
          if (!res.ok) throw new Error(`could not download ${name} (${res.status})`);
          files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name }));
        }
        await msg.edit({ components, files, attachments: [], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
      } catch (err) {
        console.error(`Could not renumber post ${ref.messageId}:`, err.message);
        failed.push(`${v.kind} ${v.no} (Total ${v.total}): ${String(err.message).slice(0, 150)}`);
        break;
      }
    }
  }
  return failed;
}

module.exports = { renumberComponents, makeResolver, refreshPosts };
