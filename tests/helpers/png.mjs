import { inflateSync } from 'node:zlib';

/** Decode 8-bit RGB/RGBA PNGs emitted by the local art tools, including all PNG filters. */
export function decodePng(bytes) {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const type = bytes[25];
  if (bytes[24] !== 8 || (type !== 6 && type !== 2) || bytes[28] !== 0) throw new Error('Unsupported PNG encoding.');
  const channels = type === 6 ? 4 : 3;
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const decoded = Buffer.alloc(width * height * channels);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Invalid PNG filter.');
    for (let x = 0; x < stride; x += 1) {
      const target = y * stride + x;
      const a = x >= channels ? decoded[target - channels] : 0;
      const b = y > 0 ? decoded[target - stride] : 0;
      const c = x >= channels && y > 0 ? decoded[target - stride - channels] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      decoded[target] = (raw[y * (stride + 1) + 1 + x] + prediction) & 255;
    }
  }
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = decoded[index * channels];
    data[index * 4 + 1] = decoded[index * channels + 1];
    data[index * 4 + 2] = decoded[index * channels + 2];
    data[index * 4 + 3] = channels === 4 ? decoded[index * channels + 3] : 255;
  }
  return { width, height, data };
}
