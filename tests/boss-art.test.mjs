import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Painter } from '../src/fighters/art-kit.ts';
import { drawBoss, bossPose, LUMIE_COLORS } from '../src/fighters/boss-art.ts';
import { parseBossAtlas } from '../src/fighters/render-types.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { SceneRenderer } from '../src/render/renderer.ts';
import { scenePlan } from '../src/render/scene-plan.ts';
import { createWorld } from '../src/world/world.ts';
import { decodePng } from './helpers/png.mjs';

const poses = ['idle', 'move', 'windup', 'strike', 'cast', 'recover', 'hurt', 'exit'];
const bossAtlas = { version: 1, frameWidth: 96, frameHeight: 112, columns: 4, rows: 2,
  anchor: { x: 48, y: 108 }, poses: Object.fromEntries(poses.map((pose, frame) => [pose, frame])) };
const heroAtlas = parseAtlas(JSON.parse(await readFile(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));
const enemy = (extra = {}) => ({ id: 20, kind: 'boss', variant: 0, x: 1260, y: 236, facing: -1,
  hp: 30, maxHP: 30, state: 'move', age: 30, readyAt: 0, pattern: 0, hit: false,
  targetX: 1260, vx: 0, vy: 0, ...extra });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}

function fakeCanvas() {
  const calls = [];
  const context = { calls, globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: true,
    drawImage(...args) { calls.push(['drawImage', ...args]); }, fillRect(...args) { calls.push(['fillRect', ...args]); },
    save(...args) { calls.push(['save', ...args]); }, restore(...args) { calls.push(['restore', ...args]); },
    translate(...args) { calls.push(['translate', ...args]); }, rotate(...args) { calls.push(['rotate', ...args]); },
    scale(...args) { calls.push(['scale', ...args]); }, setTransform(...args) { calls.push(['setTransform', ...args]); },
    fillText() {}, font: '', textBaseline: '' };
  return { width: 0, height: 0, getContext: () => context, context };
}

function withRenderer(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas() };
  try { return run(); }
  finally { if (previous === undefined) Reflect.deleteProperty(globalThis, 'document'); else globalThis.document = previous; }
}

test('the boss has a bounded independent pose atlas, never the heroine sixteen-frame atlas', () => {
  assert.equal(parseBossAtlas(bossAtlas), bossAtlas);
  for (const change of [
    data => { data.version = 2; }, data => { data.frameWidth = Infinity; }, data => { data.frameHeight = 257; },
    data => { data.rows = 3; }, data => { data.columns = 0; }, data => { data.anchor.x = 97; },
    data => { data.anchor.y = 107.5; }, data => { data.anchor.x = NaN; }, data => { data.poses.hurt = 8; },
    data => { data.poses.cast = -1; }, data => { delete data.poses.strike; }, data => { data.poses = []; },
  ]) {
    const invalid = structuredClone(bossAtlas); change(invalid); assert.throws(() => parseBossAtlas(invalid));
  }
  for (const invalid of [null, [], {}, heroAtlas]) assert.throws(() => parseBossAtlas(invalid));
  const six = { ...bossAtlas, columns: 3, rows: 2, poses: { ...bossAtlas.poses, hurt: 4, exit: 5 } };
  assert.equal(parseBossAtlas(six).columns * six.rows, 6);
  assert.throws(() => parseAtlas(bossAtlas), 'the heroine parser must remain sixteen-frame only');
});

test('pose selection explicitly distinguishes anticipation, thrust, cast, recovery, hurt and bow', () => {
  for (const [extra, expected] of [
    [{ state: 'move', age: 30 }, 'idle'], [{ state: 'enter' }, 'move'], [{ state: 'windup' }, 'windup'],
    [{ state: 'strike', age: 4, pattern: 2 }, 'strike'], [{ state: 'strike', age: 4, pattern: 0 }, 'cast'],
    [{ state: 'strike', age: 28 }, 'recover'], [{ state: 'move', age: 5, pattern: 3 }, 'recover'],
    [{ state: 'stunned' }, 'hurt'], [{ state: 'exit' }, 'exit'],
  ]) assert.equal(bossPose(enemy(extra)), expected);
});

test('clean-checkout and invalid optional metadata draw the original girl in code, not an old male boss', () => {
  const source = freeze(enemy());
  const first = new Painter(960), second = new Painter(960), invalid = new Painter(960);
  drawBoss(first, source, 90); drawBoss(second, source, 90);
  drawBoss(invalid, source, 90, { bossAtlas: { ...bossAtlas, anchor: { x: -1, y: 108 } } });
  assert.deepEqual(first.commands, second.commands);
  assert.deepEqual(first.commands, invalid.commands);
  assert.ok(first.commands.length > 100);
  assert.ok(first.commands.every(command => command.kind === 'rect'));
  assert.ok(first.commands.some(command => command.color === LUMIE_COLORS.hairLight));
  assert.ok(first.commands.some(command => command.color === LUMIE_COLORS.amber));
  assert.equal(source.state, 'move'); assert.equal(source.x, 1260);
  for (const command of first.commands) {
    assert.ok(Number.isInteger(command.x) && Number.isInteger(command.y));
    assert.ok(command.width > 0 && command.height > 0 && command.alpha > 0 && command.alpha <= 1);
  }
});

test('boss sprite commands preserve camera, foot anchor and camera-relative fallback without changing hero commands', () => {
  const painter = new Painter(960);
  painter.sprite(1100, 236, 0, 1);
  assert.deepEqual(painter.commands[0], { kind: 'sprite', x: 140, y: 236, frame: 0, facing: 1, alpha: 1, rotation: 0, scaleX: 1, scaleY: 1 });
  const e = freeze(enemy({ state: 'strike', age: 4, pattern: 2 }));
  drawBoss(painter, e, 90, { bossAtlas: freeze(structuredClone(bossAtlas)) });
  const command = painter.commands[1];
  assert.equal(command.sheet, 'boss'); assert.equal(command.frame, 3);
  assert.equal(command.x, 300); assert.equal(command.y, 236); assert.equal(command.facing, -1);
  assert.ok(command.fallback.length > 100);
  assert.ok(command.fallback.every(item => item.kind === 'rect' && item.x > 240 && item.x < 370));
  const parsed = JSON.parse(JSON.stringify(command));
  assert.deepEqual(parsed, command, 'the native bridge gets the same fallback/pose contract');
});

test('Canvas crops the optional boss sheet independently and never substitutes a heroine frame', () => withRenderer(() => {
  const canvas = fakeCanvas();
  const hero = { naturalWidth: heroAtlas.frameWidth * heroAtlas.columns, naturalHeight: heroAtlas.frameHeight * heroAtlas.rows };
  const boss = { naturalWidth: 384, naturalHeight: 224 };
  const renderer = new SceneRenderer(canvas, { background: null, character: hero, boss }, heroAtlas, 1, { bossAtlas });
  renderer.resize(480, 270);
  const p = new Painter(960); drawBoss(p, enemy({ state: 'strike', age: 4, pattern: 2 }), 90, { bossAtlas });
  const plan = scenePlan(createWorld(1), heroAtlas, [], {}, false);
  plan.battle = { cameraX: 960, commands: p.commands, room: true };
  canvas.context.calls.length = 0;
  renderer.drawPlan(plan);
  const crop = canvas.context.calls.find(call => call[0] === 'drawImage' && call[1] === boss);
  assert.deepEqual(crop, ['drawImage', boss, 288, 0, 96, 112, -48, -108, 96, 112]);
  assert.equal(canvas.context.calls.some(call => call[0] === 'drawImage' && call[1] === hero), false);
  assert.equal(canvas.context.imageSmoothingEnabled, false);
  assert.ok(canvas.context.calls.some(call => call[0] === 'scale' && call[1] === -1));
}));

test('missing, wrong-sized or invalid optional boss resources use fallback without blocking the hero', () => withRenderer(() => {
  for (const [boss, metadata] of [
    [null, bossAtlas], [{ naturalWidth: 1, naturalHeight: 1 }, bossAtlas],
    [{ naturalWidth: 384, naturalHeight: 224 }, { ...bossAtlas, rows: 10 }],
  ]) {
    const canvas = fakeCanvas();
    const hero = { naturalWidth: heroAtlas.frameWidth * heroAtlas.columns, naturalHeight: heroAtlas.frameHeight * heroAtlas.rows };
    const renderer = new SceneRenderer(canvas, { background: null, character: hero, boss }, heroAtlas, 1, { bossAtlas: metadata });
    renderer.resize(480, 270);
    const p = new Painter(960); drawBoss(p, enemy(), 90, { bossAtlas });
    p.sprite(1080, 236, 0, 1);
    const plan = scenePlan(createWorld(1), heroAtlas, [], {}, false);
    plan.battle = { cameraX: 960, commands: p.commands, room: true };
    canvas.context.calls.length = 0;
    assert.doesNotThrow(() => renderer.drawPlan(plan));
    assert.ok(canvas.context.calls.filter(call => call[0] === 'fillRect').length > 100);
    assert.equal(canvas.context.calls.filter(call => call[0] === 'drawImage' && call[1] === hero).length, 1);
    assert.equal(canvas.context.calls.some(call => call[0] === 'drawImage' && boss && call[1] === boss), false);
    assert.ok(canvas.context.calls.some(call => call[0] === 'translate' && call[1] > 260 && call[1] < 340), 'fallback coordinates are not double-translated');
  }
}));

const local = new URL('../private-art/runtime/', import.meta.url);
const hasLocalBoss = existsSync(new URL('fighters/lumie/sheet.png', local));

test('local boss poses have distinct silhouettes, shared 80-color binary alpha, transparent gutters and aligned feet', { skip: !hasLocalBoss }, async () => {
  const atlas = parseBossAtlas(JSON.parse(await readFile(new URL('fighters/lumie/atlas.json', local), 'utf8')));
  const image = decodePng(await readFile(new URL('fighters/lumie/sheet.png', local)));
  assert.equal(image.width, atlas.frameWidth * atlas.columns); assert.equal(image.height, atlas.frameHeight * atlas.rows);
  const hashes = [], colors = new Set();
  for (let frame = 0; frame < atlas.columns * atlas.rows; frame++) {
    const bytes = [], x0 = frame % atlas.columns * atlas.frameWidth, y0 = Math.floor(frame / atlas.columns) * atlas.frameHeight;
    let bottom = -1, count = 0;
    for (let y = 0; y < atlas.frameHeight; y++) for (let x = 0; x < atlas.frameWidth; x++) {
      const index = ((y0 + y) * image.width + x0 + x) * 4;
      const pixel = image.data.subarray(index, index + 4), alpha = pixel[3];
      assert.ok(alpha === 0 || alpha === 255, `frame ${frame}: binary alpha only`);
      if (x === 0 || x === atlas.frameWidth - 1 || y === 0 || y === atlas.frameHeight - 1) assert.equal(alpha, 0);
      if (alpha) { bottom = Math.max(bottom, y); count++; colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`); }
      else assert.deepEqual([...pixel], [0, 0, 0, 0], 'hidden background RGB is removed');
      bytes.push(...pixel);
    }
    assert.ok(count > 1600, `pose ${frame} contains a detailed visible figure`);
    assert.equal(bottom, atlas.anchor.y - 1);
    hashes.push(hash(Buffer.from(bytes)));
  }
  assert.ok(colors.size <= 80); assert.equal(new Set(hashes).size, 8);
  assert.equal(new Set(Object.values(atlas.poses)).size, 8, 'local production uses eight distinct key poses');
});

test('the new local boss ledger stays pending and original heroine/background bytes stay identical', { skip: !hasLocalBoss }, async () => {
  const protectedHashes = {
    'character/sheet.png': 'ea176098157c004280d3ac7a7053d859aeeca49df4b94146e828fc2994921ea3',
    'character/atlas.json': 'e788e8c551bc7b6a3477da256a966db5e5a23e94f4df32013f1747e16b5ddaa4',
    'scene/seaside-room.png': 'b37f2090cef1a0437edd05c6e4caf81d456ffde7624fdc47a95b8a74cee1fb94',
    'scene/seaside-room-matte.png': '22ecd06ca792ff4dffe48f90d804f9be22ff6d1b979cccb1fab6acc5bc175250',
    'scene/variants/night/scene.png': '54ba9d3796e37444fd6e5ab445b30afd0381b3987bf356009da1a3113aef42da',
    'scene/variants/night/matte.png': '422f6f7241cbc23792f82d7e3da50736e1c0628fe1a449d247df0278a8b15a9b',
    'scene/variants/rain/scene.png': '21d700bd959546be196bef1cd0d97c2552bc0201d3d7e7f3557c9d56fd192c2a',
    'scene/variants/rain/matte.png': 'd7b7d38e32501664517ec5676514acfd6f71160188966f9d4abcf9dd830b745c',
  };
  for (const [name, expected] of Object.entries(protectedHashes)) assert.equal(hash(await readFile(new URL(name, local))), expected, name);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', local), 'utf8'));
  for (const name of ['fighters/lumie/sheet.png', 'fighters/lumie/atlas.json']) {
    const entries = manifest.assets.filter(asset => asset.path === name);
    assert.equal(entries.length, 1); const entry = entries[0];
    assert.equal(entry.sha256, hash(await readFile(new URL(name, local))));
    assert.match(entry.permission.status, /^pending-/);
    for (const key of ['webPublication', 'sourceRedistribution', 'macAppBundling']) assert.equal(entry.permission[key], false);
  }
  assert.match(manifest.note, /非公式/); assert.match(manifest.note, /自然さは未確認/);
});
