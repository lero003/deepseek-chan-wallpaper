import { advanceWorld, applyMood, seedFromText } from '../world/world.ts';
import { parseAtlas } from '../render/atlas.ts';
import { viewportFor } from '../render/viewport.ts';
import { motesFor, scenePlan } from '../render/scene-plan.ts';
import type { Scene } from '../world/world.ts';
import type { RenderAppearance, VariantAppearance } from '../app-web/art-profile.ts';
import { resolveAppearance } from '../app-web/art-profile.ts';
import { createGame, advanceGame, command, setFocus, setMovement, gameUI } from '../fighters/game.ts';
import { gamePlan } from '../fighters/render-plan.ts';
import { sceneryQuads } from '../fighters/scenery.ts';

interface NativeVariant { id: string; label: string; scene: string; matte?: string; appearance?: VariantAppearance }
interface NativeConfiguration { atlas: unknown; layout: RenderAppearance & { scene: Scene }; variants?: NativeVariant[]; arena?: { scene: string } }

// This IIFE runs in Apple's JavaScriptCore, NOT a browser/webview. Only bundled code.
export function create(configurationJSON: string, seedText = 'seaside-v01', arenaAvailable = false) {
  const config = JSON.parse(configurationJSON) as NativeConfiguration;
  const atlas = parseAtlas(config.atlas);
  if (config.layout.scene.width !== 480 || config.layout.scene.height !== 270) throw new Error('Unsupported scene size.');
  if ((config.layout.scene.actorHalfWidth ?? 24) < (atlas.collisionHalfWidth ?? atlas.frameWidth / 2)) throw new Error('Unsafe character margin.');
  const game = createGame(seedFromText(String(seedText).slice(0, 128)), config.layout.scene);
  const world = game.world;
  const motes = motesFor(world.seed);
  const variants = config.variants ?? [];
  // The active appearance follows the selected background; sunset (index 0) is the base layout.
  let appearance: RenderAppearance = config.layout;
  // Only the host's runtime-validated image enables painted-scene overlay suppression.
  // A configured but missing/corrupt image must keep the complete code-stage ambience.
  const arenaArt = arenaAvailable === true;
  const snapshot = (decorations: boolean) => JSON.stringify(scenePlan(world, atlas, motes, appearance, decorations));
  const gameSnapshot = (decorations = true, presentation = 'preview') => {
    if (presentation !== 'preview' && presentation !== 'wallpaper') throw new Error('Invalid presentation.');
    // The shared wallpaper presentation also serves DSH. Mac's passive desktop stays quiet.
    if (presentation === 'wallpaper' && game.mode === 'endless') {
      return JSON.stringify({ ...scenePlan(world, atlas, motes, appearance, decorations), game: gameUI(game) });
    }
    const planAppearance = { ...appearance, arenaArt };
    return JSON.stringify(gamePlan(game, atlas, planAppearance, decorations, presentation, motes));
  };
  return {
    gameSnapshotJSON: gameSnapshot,
    advanceGameJSON: (seconds: number, decorations = true, presentation = 'preview') => { advanceGame(game, seconds); return gameSnapshot(decorations, presentation); },
    commandJSON: (name: string, value?: unknown) => { command(game, name, value); return JSON.stringify(gameUI(game)); },
    focusJSON: (focused: boolean) => { if (typeof focused !== 'boolean') throw new Error('Invalid focus.'); setFocus(game, focused); return JSON.stringify(gameUI(game)); },
    movementJSON: (x: number, y: number) => { setMovement(game, x, y); return JSON.stringify(gameUI(game)); },
    gameJSON: () => JSON.stringify(game),
    sceneryJSON: () => JSON.stringify(sceneryQuads(config.layout)),
    setVariantJSON: (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index > variants.length) throw new Error('Invalid background variant.');
      appearance = index === 0 ? config.layout : resolveAppearance(config.layout, variants[index - 1]?.appearance);
      applyMood(world, appearance.ambience?.mood);
      return JSON.stringify({ variant: index, mood: world.mood });
    },
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
