const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'vouches.json');

let db = { nextId: 1, vouches: [], meta: {} };
const listeners = [];

function load() {
  fs.mkdirSync(DIR, { recursive: true });
  if (fs.existsSync(FILE)) db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
}

function save(notify = true) {
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
  if (notify) for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
}

load();

module.exports = {
  add(record) {
    const entry = { id: db.nextId++, createdAt: Date.now(), ...record };
    db.vouches.push(entry);
    save();
    return entry;
  },
  update(id, patch) {
    const v = db.vouches.find((x) => x.id === id);
    if (v) { Object.assign(v, patch); save(false); }
    return v;
  },
  remove(id) {
    const i = db.vouches.findIndex((x) => x.id === id);
    if (i === -1) return null;
    const [removed] = db.vouches.splice(i, 1);
    save();
    return removed;
  },
  all: () => db.vouches,
  getMeta: (k) => db.meta[k] ?? null,
  setMeta(k, v) { db.meta[k] = v; save(false); },
  onChange: (fn) => listeners.push(fn),
};
