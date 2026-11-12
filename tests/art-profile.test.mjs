import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import { selectArtEntry } from '../scripts/art-selection.mjs';
import { parseAtlas, frameAt } from '../src/render/atlas.ts';
import { walkingRange, createWorld, advanceWorld, SEASIDE } from '../src/world/world.ts';
import { SUNSET_LAYOUT, ARENA_FRAME_COLOR } from '../src/art/scene-profiles.ts';
import { decodePng } from './helpers/png.mjs';

const root = new URL('../', import.meta.url);
const base = JSON.parse(await readFile(new URL('assets/character/atlas.json', root), 'utf8'));

test('a clean clone selects the committed placeholder without requiring private assets', () => {
  assert.equal(selectArtEntry('/project', 'production', () => false), resolve('/project/src/app-web/default-art.ts'));
});

test('local production selects its ignored art module but explicit placeholder mode cannot', () => {
  assert.equal(selectArtEntry('/project', 'production', () => true), resolve('/project/private-art/runtime/art.ts'));
  assert.equal(selectArtEntry('/project', 'development', () => true), resolve('/project/private-art/runtime/art.ts'));
  assert.equal(selectArtEntry('/project', 'placeholder', () => true), resolve('/project/src/app-web/default-art.ts'));
});

test('per-frame idle timings keep the blink short without changing behavior state', () => {
  const data = structuredClone(base);
  data.animations.idle.frameDurationsMs = [900, 160, 900, 120];
  const atlas = parseAtlas(data);
  for (const [time, expected] of [[0, 0], [0.899, 0], [0.9, 1], [1.06, 2], [1.96, 3], [2.08, 0], [NaN, 0], [Infinity, 0]]) {
    assert.equal(frameAt(atlas, 'idle', time), expected);
  }
  for (const invalid of [[120], [900, 0, 900, 120], [900, -3, 900, 120], [900, Infinity, 900, 120], [900, 60001, 900, 120]]) {
    const corrupt = structuredClone(data);
    corrupt.animations.idle.frameDurationsMs = invalid;
    assert.throws(() => parseAtlas(corrupt));
  }
});

test('larger sprite dimensions and foot anchors are parsed instead of assuming 48x64', () => {
  const data = { ...structuredClone(base), frameWidth: 80, frameHeight: 112, anchor: { x: 40, y: 108 }, collisionHalfWidth: 40 };
  const atlas = parseAtlas(data);
  assert.equal(atlas.frameWidth * atlas.columns, 320);
  assert.equal(atlas.frameHeight * atlas.rows, 448);
  for (const width of [-1, 0, NaN, Infinity, 81]) assert.throws(() => parseAtlas({ ...data, collisionHalfWidth: width }));
});

test('production collision width protects the tail in both directions for thirty minutes', () => {
  const scene = { ...SEASIDE, actorHalfWidth: 40, obstacles: [{ left: 0, right: 94 }, { left: 402, right: 480 }] };
  assert.deepEqual(walkingRange(scene), { left: 134, right: 362 });
  const world = createWorld(38573, scene);
  for (let index = 0; index < 1800 * 30; index += 1) {
    advanceWorld(world, 1 / 30);
    assert.ok(world.actor.x - 40 >= 94);
    assert.ok(world.actor.x + 40 <= 402);
  }
  for (const actorHalfWidth of [0, -1, NaN, Infinity]) assert.throws(() => walkingRange({ ...scene, actorHalfWidth }));
  assert.throws(() => walkingRange({ ...scene, floorY: NaN }));
});

test('unapproved art, dependencies, build output, and environment files stay ignored', async () => {
  const ignore = await readFile(new URL('.gitignore', root), 'utf8');
  for (const line of ['private-art/', 'node_modules/', 'dist/', 'habitat-report/', '.env', '.env.*']) {
    assert.ok(ignore.split('\n').includes(line), line);
  }
  assert.doesNotMatch(ignore, /^!private-art/m);
});

const localRoot = new URL('private-art/runtime/', root);
const hasLocal = existsSync(new URL('character/sheet.png', localRoot));

test('local atlas has 16 isolated crisp frames with the same ground contact', { skip: !hasLocal }, async () => {
  const atlas = parseAtlas(JSON.parse(await readFile(new URL('character/atlas.json', localRoot), 'utf8')));
  const image = decodePng(await readFile(new URL('character/sheet.png', localRoot)));
  assert.equal(image.width, atlas.frameWidth * atlas.columns);
  assert.equal(image.height, atlas.frameHeight * atlas.rows);
  const hashes = [];
  const colors = new Set();
  for (let frame = 0; frame < 16; frame += 1) {
    const x0 = frame % atlas.columns * atlas.frameWidth;
    const y0 = Math.floor(frame / atlas.columns) * atlas.frameHeight;
    let count = 0, bottom = 0;
    const rgba = [];
    for (let y = 0; y < atlas.frameHeight; y += 1) {
      for (let x = 0; x < atlas.frameWidth; x += 1) {
        const offset = ((y0 + y) * image.width + x0 + x) * 4;
        const pixel = image.data.subarray(offset, offset + 4);
        const alpha = pixel[3];
        assert.ok(alpha === 0 || alpha === 255, `no translucent keying halo in frame ${frame}`);
        if (x === 0 || x === atlas.frameWidth - 1 || y === 0 || y === atlas.frameHeight - 1) assert.equal(alpha, 0);
        if (alpha) {
          count += 1; bottom = Math.max(bottom, y);
          colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
          assert.ok(Math.abs(x - atlas.anchor.x) <= atlas.collisionHalfWidth);
        }
        rgba.push(...pixel);
      }
    }
    assert.ok(count > 800, `frame ${frame} is visible`);
    assert.equal(bottom, atlas.anchor.y - 1, `frame ${frame} is grounded`);
    hashes.push(createHash('sha256').update(Buffer.from(rgba)).digest('hex'));
  }
  assert.ok(colors.size <= 80, 'the palette is shared by every frame');
  for (const animation of Object.values(atlas.animations)) assert.equal(new Set(animation.frames.map(frame => hashes[frame])).size, animation.frames.length);
});

test('the local blink changes only eye pixels, not head, costume, or stance', { skip: !hasLocal }, async () => {
  const image = decodePng(await readFile(new URL('character/sheet.png', localRoot)));
  let differences = 0;
  for (let y = 0; y < 112; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      const a = (y * image.width + x) * 4;
      const b = (y * image.width + 240 + x) * 4;
      const same = image.data.subarray(a, a + 4).equals(image.data.subarray(b, b + 4));
      const eye = (x >= 40 && x <= 45 && y >= 31 && y <= 35) || (x >= 50 && x <= 52 && y >= 30 && y <= 34);
      if (!eye) assert.equal(same, true, `blink must not move pixel ${x},${y}`);
      if (!same) differences += 1;
    }
  }
  assert.ok(differences > 5 && differences <= 45);
});

test('local production asset provenance matches bytes and never claims publication permission', { skip: !hasLocal }, async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', localRoot), 'utf8'));
  assert.equal(manifest.releaseGate, 'private-local-runtime-only');
  for (const asset of manifest.assets) {
    assert.ok(!asset.path.startsWith('/') && !asset.path.split('/').includes('..'));
    const content = await readFile(new URL(asset.path, localRoot));
    assert.equal(createHash('sha256').update(content).digest('hex'), asset.sha256);
    assert.ok(asset.author && asset.source && asset.license && asset.modifications.length);
    for (const permission of ['webPublication', 'sourceRedistribution', 'macAppBundling']) assert.equal(asset.permission[permission], false);
  }
  const bg = decodePng(await readFile(new URL('scene/seaside-room.png', localRoot)));
  assert.equal(bg.width, 480); assert.equal(bg.height, 270);
  for (let offset = 3; offset < bg.data.length; offset += 4) assert.equal(bg.data[offset], 255);
});

const localMatte = new URL('scene/seaside-room-matte.png', localRoot);

test('the wide wallpaper matte keeps the approved room pixel-exact', { skip: !existsSync(localMatte) }, async () => {
  const matte = decodePng(await readFile(localMatte));
  assert.equal(matte.width, 1024);
  assert.equal(matte.height, 576);
  for (let offset = 3; offset < matte.data.length; offset += 4) assert.equal(matte.data[offset], 255, 'the matte is fully opaque');
  const room = decodePng(await readFile(new URL('scene/seaside-room.png', localRoot)));
  const region = Buffer.alloc(480 * 270 * 4);
  for (let y = 0; y < 270; y += 1) {
    const source = ((y + 153) * 1024 + 272) * 4;
    matte.data.copy(region, y * 480 * 4, source, source + 480 * 4);
  }
  assert.equal(Buffer.compare(region, room.data), 0, 'the new wide matte must not alter one pixel of the approved room');
  assert.deepEqual(SUNSET_LAYOUT.matte, { width: 1024, height: 576, roomX: 272, roomY: 153 });
  assert.equal(SUNSET_LAYOUT.backgroundUrl, undefined, 'the layout stays free of web-only asset URLs');
});

test('the fixed arena frame is one flat shared colour, not a stretched edge column', () => {
  assert.match(ARENA_FRAME_COLOR, /^#[0-9a-f]{6}$/);
  assert.equal(SUNSET_LAYOUT.arenaFrameColor, ARENA_FRAME_COLOR,
    'the prepared native configuration must carry the same frame colour as the Web canvas');
});

const localVariants = new URL('variants.json', localRoot);

test('additional wallpaper backgrounds are complete and keep their own scene pixel-exact', { skip: !existsSync(localVariants) }, async () => {
  const data = JSON.parse(await readFile(localVariants, 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.ok(data.variants.length >= 2, 'the night and rain backgrounds are present');
  const manifest = JSON.parse(await readFile(new URL('manifest.json', localRoot), 'utf8'));
  const ids = new Set();
  for (const variant of data.variants) {
    assert.match(variant.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(variant.id));
    ids.add(variant.id);
    assert.ok(typeof variant.label === 'string' && variant.label.length > 0);
    const scene = decodePng(await readFile(new URL(variant.scene, localRoot)));
    assert.equal(scene.width, 480);
    assert.equal(scene.height, 270);
    const matte = decodePng(await readFile(new URL(variant.matte, localRoot)));
    assert.equal(matte.width, 1024);
    assert.equal(matte.height, 576);
    const region = Buffer.alloc(480 * 270 * 4);
    for (let y = 0; y < 270; y += 1) {
      const source = ((y + 153) * 1024 + 272) * 4;
      matte.data.copy(region, y * 480 * 4, source, source + 480 * 4);
    }
    assert.equal(Buffer.compare(region, scene.data), 0, `${variant.id} matte must keep the scene pixel-exact`);
    for (const path of [variant.scene, variant.matte]) {
      assert.ok(manifest.assets.some((asset) => asset.path === path), `${path} is in the private ledger`);
    }
  }
});
