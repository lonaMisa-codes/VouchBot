const UNITS = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
const SCALES = [[1e12, 't'], [1e9, 'b'], [1e6, 'm'], [1e3, 'k']];

// Accepts "250k", "1.5m", "2b", "$3,000", "1000000"
function parsePrice(input) {
  const m = String(input).trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(\d+(?:\.\d+)?)([kmbt])?$/);
  if (!m) return null;
  const value = Math.round(parseFloat(m[1]) * (UNITS[m[2]] ?? 1));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// 16200000 -> "16.2m"
function short(n) {
  for (const [size, label] of SCALES) {
    if (n >= size) return `${(n / size).toFixed(2).replace(/\.?0+$/, '')}${label}`;
  }
  return String(n);
}

// 16200000 -> "(16.2m) 16,200,000"
function money(n) {
  const full = n.toLocaleString('en-US');
  return n >= 1000 ? `(${short(n)}) ${full}` : full;
}

// 105 -> "1 stack + 41", 128 -> "2 stacks", 41 -> "41"
function stacks(n) {
  const s = Math.floor(n / 64);
  const rest = n % 64;
  if (!s) return String(n);
  return `${s} stack${s === 1 ? '' : 's'}${rest ? ` + ${rest}` : ''}`;
}

module.exports = { parsePrice, short, money, stacks };
