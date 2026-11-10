import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { create } from '../src/app-mac/native-bridge.ts';
import { PLACEHOLDER_LAYOUT, SUNSET_LAYOUT } from '../src/art/scene-profiles.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { createWorld, advanceWorld, seedFromText } from '../src/world/world.ts';
import { motesFor, scenePlan } from '../src/render/scene-plan.ts';
import { systemLibraryPaths } from '../scripts/macos-dependencies.mjs';
import { appDirectoryName } from '../scripts/macos-archive.mjs';

const atlas = parseAtlas(JSON.parse(await readFile(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));

test('native bridge and Web render commands share one world without browser APIs', () => {
  const config = { atlas, layout: PLACEHOLDER_LAYOUT };
  const engine = create(JSON.stringify(config));
  const world = createWorld(seedFromText('seaside-v01'), PLACEHOLDER_LAYOUT.scene);
  assert.deepEqual(JSON.parse(engine.snapshotJSON()), scenePlan(world, atlas, motesFor(world.seed), PLACEHOLDER_LAYOUT));
  for (let index = 0; index < 300; index++) {
    advanceWorld(world, 1 / 30);
    engine.advanceJSON(1 / 30);
  }
  assert.deepEqual(JSON.parse(engine.worldJSON()), world);
  assert.deepEqual(JSON.parse(engine.snapshotJSON()), scenePlan(world, atlas, motesFor(world.seed), PLACEHOLDER_LAYOUT));
  assert.equal(JSON.parse(engine.snapshotJSON(false)).quads.length, 2);
});

test('native bridge rejects unsafe geometry or unbounded replay instead of executing paths', () => {
  assert.throws(() => create(JSON.stringify({ atlas: { ...atlas, collisionHalfWidth: 40 }, layout: PLACEHOLDER_LAYOUT })));
  const engine = create(JSON.stringify({ atlas, layout: PLACEHOLDER_LAYOUT }));
  assert.throws(() => engine.replayJSON(1000001, 1 / 30));
  assert.throws(() => engine.replayJSON(1, Infinity));
  assert.equal(JSON.parse(engine.viewportJSON(1440, 900)).originY, 15);
  assert.equal(SUNSET_LAYOUT.scene.actorHalfWidth, 40);
});

test('library validation ignores the executable header but rejects any non-system dependency', () => {
  const header = '/a/private/build/くじらの散歩道.app/Contents/MacOS/KujiraWallpaper:\n';
  assert.deepEqual(systemLibraryPaths(header + '\t/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit (compatibility version 45.0.0)\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n'), [
    '/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit', '/usr/lib/libSystem.B.dylib',
  ]);
  assert.throws(() => systemLibraryPaths(header + '\t/a/private/build/libSomething.dylib (compatibility version 1.0.0)'));
  assert.throws(() => systemLibraryPaths(header));
});

test('archive validation recognizes composed and decomposed Japanese app names, never a missing or duplicate app', () => {
  const expected = 'くじらの散歩道.app';
  assert.equal(appDirectoryName(['__MACOSX', expected]), expected);
  assert.equal(appDirectoryName([expected.normalize('NFD')]), expected.normalize('NFD'));
  assert.throws(() => appDirectoryName(['another.app']));
  assert.throws(() => appDirectoryName([expected, expected.normalize('NFD')]));
});

test('the native host does not write wallpaper preferences or register login startup', async () => {
  const source = await readFile(new URL('../src/app-mac/App/AppController.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setDesktopImageURL|desktopImageURL|SMAppService|SMLoginItemSetEnabled|CGEventPost|AXIsProcessTrusted/);
  assert.match(source, /ignoresMouseEvents = true/);
  assert.match(source, /desktop \+ 1/);
  assert.match(source, /window\.orderFrontRegardless\(\)/);
  assert.match(source, /canJoinAllSpaces/);
  const manifest = await readFile(new URL('../Package.swift', import.meta.url), 'utf8');
  assert.match(manifest, /dependencies: \[\]/);
  const app = await readFile(new URL('../src/app-mac/App/Main.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /URLSession|WKWebView|SFSpeech|AVCapture/);
});
