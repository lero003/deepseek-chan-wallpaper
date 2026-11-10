import { advanceWorld, seedFromText } from '../world/world.ts';
import { parseAtlas } from '../render/atlas.ts';
import { viewportFor } from '../render/viewport.ts';
import { motesFor, scenePlan } from '../render/scene-plan.ts';
import type { Scene } from '../world/world.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import { createGame, advanceGame, command, setFocus, setMovement, gameUI } from '../fighters/game.ts';
import { gamePlan } from '../fighters/render-plan.ts';
import { sceneryQuads } from '../fighters/scenery.ts';

interface NativeConfiguration { atlas: unknown; layout: RenderAppearance & { scene: Scene } }

// This IIFE runs in Apple's JavaScriptCore, NOT a browser/webview. Only bundled code.
export function create(configurationJSON: string, seedText = 'seaside-v01') {
  const config = JSON.parse(configurationJSON) as NativeConfiguration;
  const atlas = parseAtlas(config.atlas);
  if (config.layout.scene.width !== 480 || config.layout.scene.height !== 270) throw new Error('Unsupported scene size.');
  if ((config.layout.scene.actorHalfWidth ?? 24) < (atlas.collisionHalfWidth ?? atlas.frameWidth / 2)) throw new Error('Unsafe character margin.');
  const game = createGame(seedFromText(String(seedText).slice(0, 128)), config.layout.scene);
  const world = game.world;
  const motes = motesFor(world.seed);
  const snapshot = (decorations: boolean) => JSON.stringify(scenePlan(world, atlas, motes, config.layout, decorations));
  const gameSnapshot = (decorations = true, presentation = 'preview') => {
    if (presentation !== 'preview' && presentation !== 'wallpaper') throw new Error('Invalid presentation.');
    return JSON.stringify(gamePlan(game, atlas, config.layout, decorations, presentation, motes));
  };
  return {
    gameSnapshotJSON: gameSnapshot,
    advanceGameJSON: (seconds: number, decorations = true, presentation = 'preview') => { advanceGame(game, seconds); return gameSnapshot(decorations, presentation); },
    commandJSON: (name: string, value?: unknown) => { command(game, name, value); return JSON.stringify(gameUI(game)); },
    focusJSON: (focused: boolean) => { if (typeof focused !== 'boolean') throw new Error('Invalid focus.'); setFocus(game, focused); return JSON.stringify(gameUI(game)); },
    movementJSON: (x: number, y: number) => { setMovement(game, x, y); return JSON.stringify(gameUI(game)); },
    gameJSON: () => JSON.stringify(game),
    sceneryJSON: () => JSON.stringify(sceneryQuads(config.layout)),
    replayGameJSON: (frames: number, step: number) => {
      if (!Number.isInteger(frames) || frames < 0 || frames > 1000000 || !Number.isFinite(step) || step <= 0 || step > .25) throw new Error('Invalid replay.');
      for (let index = 0; index < frames; index++) advanceGame(game, step);
      return JSON.stringify(game);
    },
    snapshotJSON: (decorations = true) => snapshot(decorations),
    advanceJSON: (seconds: number, decorations = true) => { advanceWorld(world, seconds); return snapshot(decorations); },
    worldJSON: () => JSON.stringify(world),
    replayJSON: (frames: number, step: number) => {
      if (!Number.isInteger(frames) || frames < 0 || frames > 1000000 || !Number.isFinite(step) || step <= 0 || step > .25) throw new Error('Invalid replay.');
      for (let index = 0; index < frames; index++) advanceWorld(world, step);
      return JSON.stringify(world);
    },
    viewportJSON: (width: number, height: number) => JSON.stringify(viewportFor(width, height)),
  };
}
