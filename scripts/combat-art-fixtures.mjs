import { createGame, command, setFocus } from '../src/fighters/game.ts';
import { gamePlan } from '../src/fighters/render-plan.ts';
import { ATTACKS, ENEMIES } from '../src/fighters/definitions.ts';
import { COMBAT_POSES, ENEMY_POSES } from '../src/fighters/pose-art.ts';

/** Static renderer fixtures, not a live-game/debug mutation interface. */
export function combatArtFixtures(atlas, layout, arenaArt) {
  if (!layout.combatAtlas && !layout.slimeAtlas && !layout.popupAtlas) return [];
  const samples = [];
  function base() {
    const game = createGame(123, layout.scene);
    command(game, 'play'); setFocus(game, true);
    game.phase = 'battle'; game.phaseAge = 300; game.tick = 300; game.combatTick = 300;
    game.cameraX = 960; game.hero.x = 1140; game.hero.y = 238; game.hero.facing = 1;
    game.enemies = []; game.effects = []; game.projectiles = [];
    return game;
  }
  const appearance = { ...layout, arenaArt };
  for (const pose of layout.combatAtlas ? COMBAT_POSES : []) {
    const game = base();
    if (pose.startsWith('attack')) {
      game.hero.state = 'attack'; game.hero.combo = Number(pose.slice(-1));
      game.hero.age = ATTACKS[game.hero.combo - 1].windup + 2;
    } else { game.hero.state = pose; game.hero.age = pose === 'special' ? 18 : 5; }
    samples.push({ name: `combat-${pose}`, sheet: 'combat', plan: gamePlan(game, atlas, appearance) });
  }
  for (const kind of ['slime', 'popup'].filter(kind => layout[`${kind}Atlas`])) for (let variant = 0; variant < 3; variant++) for (const pose of ENEMY_POSES) {
    const game = base();
    const state = { idle: 'move', move: 'move', windup: 'windup', strike: 'strike', hurt: 'stunned', exit: 'exit' }[pose];
    game.enemies = [{ id: 100, kind, variant, x: 1294, y: 238, facing: -1, hp: ENEMIES[kind][variant].hp,
      maxHP: ENEMIES[kind][variant].hp, state, age: pose === 'move' ? 25 : pose === 'idle' ? 0 : 5,
      readyAt: 0, pattern: 0, hit: false, targetX: 1140, vx: 0, vy: 0 }];
    samples.push({ name: `${kind}-${variant}-${pose}`, sheet: kind, plan: gamePlan(game, atlas, appearance) });
  }
  return samples;
}
