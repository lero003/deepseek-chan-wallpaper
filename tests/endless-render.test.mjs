import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ARENA_STAGES } from '../src/fighters/definitions.ts';
import { arenaStageQuads, drawEndlessAmbience } from '../src/fighters/endless-art.ts';
import { Painter } from '../src/fighters/art-kit.ts';
import { SceneRenderer } from '../src/render/renderer.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { scenePlan } from '../src/render/scene-plan.ts';
import { createWorld } from '../src/world/world.ts';

const atlas = parseAtlas(JSON.parse(await readFile(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));
function canvas() {
  const calls = [], context = { calls, drawImage(...args) { calls.push(['image', ...args]); },
    fillRect(...args) { calls.push(['rect', this.fillStyle, this.globalAlpha, ...args]); },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, fillText() {} };
  return { width: 0, height: 0, context, getContext: () => context };
}

test('six code stages are distinct, complete, deterministic and inside a bounded pixel budget', () => {
  const backgrounds = [];
  for (const id of Object.keys(ARENA_STAGES)) {
    const quads = arenaStageQuads(id); backgrounds.push(JSON.stringify(quads));
    assert.deepEqual(quads, arenaStageQuads(id));
    assert.equal(quads[0].width, 480); assert.equal(quads[0].height, 270); assert.equal(quads[0].alpha, 1);
    assert.ok(quads.length < 120);
    assert.ok(quads.every(quad => quad.x >= 0 && quad.y >= 0 && quad.x + quad.width <= 480 && quad.y + quad.height <= 270), 'code backgrounds never bleed into the flat frame');
    const p = new Painter(960), second = new Painter(960);
    drawEndlessAmbience(p, id, 731, false); drawEndlessAmbience(second, id, 731, false);
    assert.deepEqual(p.commands, second.commands); assert.ok(p.commands.length <= 34);
    assert.ok(p.commands.every(command => command.kind === 'rect' && command.x >= 0 && command.x < 480));
  }
  assert.equal(new Set(backgrounds).size, 6);
});

test('stage cache switches by id, validates each optional image, and frames the intact scene with a flat colour', () => {
  const saved = globalThis.document; globalThis.document = { createElement: () => canvas() };
  try {
    const surface = canvas(), terrace = { naturalWidth: 480, naturalHeight: 270 }, night = { naturalWidth: 480, naturalHeight: 270 };
    const renderer = new SceneRenderer(surface, { background: null, character: null, arena: terrace,
      arenas: { 'terrace-night': night, 'terrace-rain': { naturalWidth: 1, naturalHeight: 1 } } }, atlas, 3);
    renderer.resize(1600, 700);
    const plan = scenePlan(createWorld(3), atlas, [], {}, false);
    const draw = id => {
      plan.battle = { arena: true, stageId: id, cameraX: 960, commands: [] };
      surface.context.calls.length = 0; renderer.drawPlan(plan);
      return surface.context.calls.filter(call => call[0] === 'image' && call[1].context).at(-1)[1];
    };
    const first = draw('terrace'); assert.equal(draw('terrace'), first, 'same stage reuses cache');
    assert.equal(first.width, 800); assert.equal(first.height, 350);
    assert.deepEqual(first.context.calls, [['rect', ARENA_STAGES.terrace.frameColor, undefined, 0, 0, 800, 350], ['image', terrace, 160, 40]]);
    const second = draw('terrace-night'); assert.notEqual(second, first);
    assert.ok(second.context.calls.some(call => call[0] === 'image' && call[1] === night));
    const rain = draw('terrace-rain');
    assert.equal(rain.context.calls.some(call => call[0] === 'image'), false, 'invalid dimensions use complete code fallback');
    assert.ok(rain.context.calls.some(call => call[0] === 'rect' && call[1] === ARENA_STAGES['terrace-rain'].sky));
    const dawn = draw('pier-dawn'); assert.notEqual(dawn, rain);
    assert.equal(dawn.context.calls.some(call => call[0] === 'image'), false, 'absent image uses code fallback');
    const back = draw('terrace'); assert.notEqual(back, dawn);
    assert.ok(back.context.calls.some(call => call[0] === 'image' && call[1] === terrace));
    renderer.resize(960, 540); assert.notEqual(draw('terrace'), back, 'resize invalidates cache');
    plan.battle = { arena: true, cameraX: 960, commands: [] }; renderer.drawPlan(plan);
    assert.ok(surface.context.calls.some(call => call[0] === 'image' && call[1].context?.calls.some(item => item[0] === 'image' && item[1] === terrace)), 'manual retains the legacy terrace');
  } finally { if (saved === undefined) delete globalThis.document; else globalThis.document = saved; }
});
