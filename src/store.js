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

// Every vouch keeps its own numbers: `no` (number inside its category) and `total` (overall number).
// Older records get theirs once, in the order they were posted, so removing a vouch never renumbers the others.
function numberLegacy() {
  const top = { total: 0 };
  for (const v of db.vouches) {
    if (v.total !== undefined) { top.total = Math.max(top.total, v.total); top[v.kind] = Math.max(top[v.kind] ?? 0, v.no ?? 0); }
  }
  let changed = false;
  for (const v of db.vouches) {
    if (v.total !== undefined) continue;
    v.no = top[v.kind] = (top[v.kind] ?? 0) + 1;
    v.total = top.total += 1;
    changed = true;
  }
  if (changed) save(false);
}

// Smallest positive number not used yet, so a removed vouch's number is handed out again
const lowestFree = (nums) => {
  const used = new Set(nums);
  let n = 1;
  while (used.has(n)) n++;
  return n;
};

load();
numberLegacy();

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
  nextNumbers: (kind) => ({
    no: lowestFree(db.vouches.filter((v) => v.kind === kind).map((v) => v.no)),
    total: lowestFree(db.vouches.map((v) => v.total)),
  }),
  // type: 'spawner' | 'build' | 'giveaway' (number inside that category) or 'total' (overall number)
  findByNumber: (type, n) => db.vouches.find((v) => (type === 'total' ? v.total === n : v.kind === type && v.no === n)) ?? null,
  getMeta: (k) => db.meta[k] ?? null,
  setMeta(k, v) { db.meta[k] = v; save(false); },
  onChange: (fn) => listeners.push(fn),
};
