import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { generateAssets } from '../scripts/generate-art.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('assets/manifest.json', root), 'utf8'));

function png(bytes) {
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8); assert.equal(bytes[25], 6);
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const name = bytes.toString('ascii', offset + 4, offset + 8);
    if (name === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    assert.equal(raw[row], 0, 'generator uses unfiltered RGBA rows');
    raw.copy(data, y * width * 4, row + 1, row + 1 + width * 4);
  }
  return { width, height, data };
}

test('every generated file matches its reproducible editable source', async () => {
  for (const [path, expected] of generateAssets()) {
    assert.deepEqual(await readFile(new URL(path, root)), expected, path);
  }
});

test('all image files are in the ledger with checksums and explicit pending permission', async () => {
  const paths = (await readdir(new URL('assets/', root), { recursive: true })).filter((path) => /\.(png|svg)$/.test(path));
  for (const path of paths) assert.ok(manifest.assets.some((asset) => asset.path === `assets/${path}`), path);
  assert.equal(manifest.releaseGate, 'private-prototype-only');
  assert.equal(manifest.thirdPartyCharacterArtIncluded, false);
  for (const asset of manifest.assets) {
    const bytes = await readFile(new URL(asset.path, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(asset.author && asset.source && asset.license && asset.modifications.length);
    assert.equal(asset.sourceUrl, null);
    assert.equal(asset.permission.status, 'local-prototype-only');
    assert.equal(asset.permission.webPublication, false);
    assert.equal(asset.permission.macAppBundling, false);
    assert.equal(asset.permission.sourceRedistribution, false);
  }
});

test('the background is 480×270 and entirely opaque', async () => {
  const image = png(await readFile(new URL('assets/scene/seaside-room.png', root)));
  assert.equal(image.width, 480); assert.equal(image.height, 270);
  for (let offset = 3; offset < image.data.length; offset += 4) assert.equal(image.data[offset], 255);
});

test('all sixteen sprites have transparent edges, stable feet, and visible content', async () => {
  const image = png(await readFile(new URL('assets/character/sheet.png', root)));
  assert.equal(image.width, 192); assert.equal(image.height, 256);
  const frames = [];
  for (let frame = 0; frame < 16; frame += 1) {
    const x0 = frame % 4 * 48; const y0 = Math.floor(frame / 4) * 64;
    let count = 0; let bottom = 0;
    const pixels = [];
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        const offset = ((y0 + y) * image.width + x0 + x) * 4;
        const alpha = image.data[offset + 3];
        if (x === 0 || x === 47 || y === 0 || y === 63) assert.equal(alpha, 0, `frame ${frame} edge`);
        if (alpha) { count += 1; bottom = Math.max(bottom, y); }
        pixels.push(...image.data.subarray(offset, offset + 4));
      }
    }
    assert.ok(count > 350, `frame ${frame} is not blank`);
    assert.equal(bottom, 59, `frame ${frame} touches the same foot anchor`);
    frames.push(createHash('sha256').update(Buffer.from(pixels)).digest('hex'));
  }
  // Turn may reuse a resting pose, but no state contains duplicate frames.
  for (const indices of [[0, 1, 2, 3], [4, 5, 6, 7, 8, 9], [10, 11], [12, 13, 14, 15]]) {
    assert.equal(new Set(indices.map((index) => frames[index])).size, indices.length);
  }
});

test('the dependency graph cannot silently introduce automated browser tooling', async () => {
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  for (const name of Object.keys(lock.packages)) assert.doesNotMatch(name, /playwright|puppeteer|selenium|chromium/i);
});
