import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodePng } from './helpers/png.mjs';

const root = new URL('../private-art/runtime/', import.meta.url);
const available = existsSync(new URL('variants.json', root));
const read = name => readFileSync(new URL(name, root));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('local wallpaper offers five distinct scenes and new matte centers match their scenes exactly', { skip: !available }, () => {
  const variants = JSON.parse(read('variants.json')).variants;
  assert.deepEqual(variants.map(item => item.id), ['night', 'rain', 'dawn', 'snow']);
  const hashes = ['scene/seaside-room.png', ...variants.map(item => item.scene)].map(name => sha(read(name)));
  assert.equal(new Set(hashes).size, 5);
  for (const id of ['dawn', 'snow']) {
    const item = variants.find(item => item.id === id), scene = decodePng(read(item.scene)), matte = decodePng(read(item.matte));
    assert.deepEqual([scene.width, scene.height, matte.width, matte.height], [480, 270, 1024, 576]);
    for (let y = 0; y < 270; y++) assert.deepEqual(matte.data.subarray(((153 + y) * 1024 + 272) * 4, ((153 + y) * 1024 + 752) * 4), scene.data.subarray(y * 480 * 4, (y + 1) * 480 * 4));
  }
});

test('the two new painted arenas are distinct, opaque, correctly sized and recorded with pending rights', { skip: !available }, () => {
  const ledger = JSON.parse(read('manifest.json')).assets, seen = new Set();
  for (const id of ['garden-dawn', 'courtyard-snow']) {
    const path = `scene/arena/${id}.png`, bytes = read(path), image = decodePng(bytes);
    assert.deepEqual([image.width, image.height], [480, 270]);
    for (let i = 3; i < image.data.length; i += 4) assert.equal(image.data[i], 255);
    const entry = ledger.find(item => item.path === path);
    assert.equal(entry.sha256, sha(bytes)); assert.equal(entry.permission.webPublication, false);
    seen.add(entry.sha256);
  }
  assert.equal(seen.size, 2);
});
