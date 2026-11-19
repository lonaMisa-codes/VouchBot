const zlib = require('zlib');

// Reads the build dimensions out of a Litematica (.litematic) file.
// A .litematic is a gzipped NBT file; Metadata.EnclosingSize holds the x / y / z size.
// Returns { x, y, z } or null if the file can't be read (wrong format, damaged, too big).

const MAX_UNZIPPED = 256 * 1024 * 1024;

function readNbt(buf) {
  let o = 0;
  const str = () => { const n = buf.readUInt16BE(o); o += 2; const s = buf.toString('utf8', o, o + n); o += n; return s; };
  const SIZES = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 4, 6: 8 };

  function skipOrRead(type) {
    switch (type) {
      case 1: { const v = buf.readInt8(o); o += 1; return v; }
      case 2: { const v = buf.readInt16BE(o); o += 2; return v; }
      case 3: { const v = buf.readInt32BE(o); o += 4; return v; }
      case 4: o += 8; return null;
      case 5: o += 4; return null;
      case 6: o += 8; return null;
      case 7: { const n = buf.readInt32BE(o); o += 4 + n; return null; }
      case 8: return str();
      case 9: {
        const t = buf.readUInt8(o); const n = buf.readInt32BE(o + 1); o += 5;
        if (SIZES[t]) o += SIZES[t] * n;
        else for (let i = 0; i < n; i++) skipOrRead(t);
        return null;
      }
      case 10: return compound();
      case 11: { const n = buf.readInt32BE(o); o += 4 + n * 4; return null; }
      case 12: { const n = buf.readInt32BE(o); o += 4 + n * 8; return null; }
      default: throw new Error(`bad NBT tag ${type}`);
    }
  }

  function compound() {
    const out = {};
    for (;;) {
      const type = buf.readUInt8(o); o += 1;
      if (type === 0) return out;
      const name = str();
      out[name] = skipOrRead(type);
    }
  }

  const rootType = buf.readUInt8(o); o += 1;
  if (rootType !== 10) throw new Error('not an NBT compound');
  str();
  return compound();
}

function readSize(fileBuffer) {
  try {
    const raw = zlib.gunzipSync(fileBuffer, { maxOutputLength: MAX_UNZIPPED });
    const size = readNbt(raw)?.Metadata?.EnclosingSize;
    if (size && [size.x, size.y, size.z].every((n) => Number.isInteger(n) && n > 0)) return { x: size.x, y: size.y, z: size.z };
  } catch {
    // not a readable litematic: caller falls back to the file size only
  }
  return null;
}

// "120 x 64 x 97 = 744,960" (the number is x * y * z), or "Unknown" when the dimensions can't be read
function describeSize(fileBuffer) {
  const d = readSize(fileBuffer);
  return d ? `${d.x} x ${d.y} x ${d.z} = ${(d.x * d.y * d.z).toLocaleString('en-US')}` : 'Unknown';
}

module.exports = { readSize, describeSize };
