import { ATTACKS, HERO } from './definitions.ts';
import { effect, say } from './events.ts';
import { direction, moveOnFloor, clamp } from './movement.ts';
import { recordStat } from './factory.ts';
import { arcadeDamage, scoreHit } from './arcade.ts';
import type { Enemy, FightersGame } from './types.ts';

export const inBattle = (game: FightersGame): boolean => game.phase === 'battle' || game.phase === 'boss';

export function damageEnemy(game: FightersGame, enemy: Enemy, amount: number, knockback: number): void {
  if (game.route === 'arena' && !inBattle(game) || enemy.hp <= 0 || enemy.state === 'exit') return;
  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  // Small hits do not erase a boss telegraph; the third hit/special can interrupt it.
  if (enemy.kind !== 'boss' || enemy.hp === 0 || amount >= 2) {
    enemy.vx = game.hero.facing * knockback; enemy.vy = 0; enemy.age = 0;
    enemy.state = enemy.hp === 0 ? 'exit' : 'stunned';
  }
  game.lastProgressAt = game.tick; recordStat(game, 'hits');
  game.hero.gauge = Math.min(100, game.hero.gauge + 13);
  game.hero.hitCombo = game.combatTick <= game.hero.hitComboUntil ? game.hero.hitCombo + 1 : 1;
  game.hero.hitComboUntil = game.combatTick + 120;
  scoreHit(game, enemy, before - enemy.hp);
  game.hitstop = Math.max(game.hitstop, amount >= 2 ? 5 : 3);
  const height = enemy.kind === 'boss' ? 40 : enemy.kind === 'popup' ? 18 : 12;
  effect(game, amount >= 2 ? 'ring' : 'spark', enemy.x, enemy.y - height, '', amount >= 2 ? 28 : 24);
  if (amount >= 2) effect(game, 'shock', enemy.x, enemy.y, '', 26);
  if (enemy.hp === 0) {
    effect(game, enemy.kind === 'slime' ? 'bubbles' : 'stars', enemy.x, enemy.y - height, '', 34);
    if (enemy.kind === 'boss') {
      effect(game, 'paper', enemy.x, enemy.y - 60, '', 46);
      effect(game, 'confetti', enemy.x, enemy.y - 40, '', 60, { vx: 30, vy: -70, gravity: 150 });
    } else if (enemy.kind === 'popup') {
      effect(game, 'ink', enemy.x, enemy.y - 16, '', 24);
    }
  } else if (enemy.kind === 'boss' && before > enemy.maxHP / 2 && enemy.hp <= enemy.maxHP / 2) {
    effect(game, 'ring', enemy.x, enemy.y - 42, '', 40);
    effect(game, 'shock', enemy.x, enemy.y, '', 40);
    effect(game, 'ink', enemy.x, enemy.y - 20, '', 34);
  }
}

export function damageHero(game: FightersGame, fromX: number): void {
  const hero = game.hero;
  if (game.route === 'arena' && !inBattle(game) || game.combatTick < game.graceUntil || game.combatTick < hero.invulnerableUntil || hero.hp <= 0) return;
  hero.hp = Math.max(game.mode === 'auto' ? 1 : 0, hero.hp - 1);
  recordStat(game, 'damageTaken'); arcadeDamage(game);
  hero.gauge = Math.min(100, hero.gauge + 5); hero.state = hero.hp === 0 ? 'down' : 'hurt'; hero.age = 0;
  hero.invulnerableUntil = game.combatTick + 58;
  hero.vx = hero.x >= fromX ? 55 : -55; hero.vy = 0; hero.attackQueue = 0;
  effect(game, 'stars', hero.x, hero.y - 83, 'あっ');
  effect(game, 'spark', hero.x, hero.y - 52, '', 20);
  effect(game, 'dust', hero.x - hero.facing * 12, hero.y, '', 22, { vy: -10 });
  if (game.mode === 'auto' && hero.hp === 1) {
    hero.hp = 3; hero.invulnerableUntil = game.combatTick + 80;
    say(game, 'ひと息ついて、もう一度。'); effect(game, 'tea', hero.x + 20, hero.y - 34);
  }
}

function beginAttack(game: FightersGame): void {
  const hero = game.hero;
  hero.combo = game.combatTick <= hero.comboUntil ? hero.combo % 3 + 1 : 1;
  const attack = ATTACKS[hero.combo - 1]!;
  hero.state = 'attack'; hero.age = 0; hero.attackId++; hero.hitIds = [];
  if (hero.attackId === game.whiffAttackId) recordStat(game, 'misses');
  hero.comboUntil = game.combatTick + attack.windup + attack.active + attack.recovery + HERO.comboWindow;
  hero.attackQueue--; hero.queueUntil = game.combatTick + HERO.comboWindow;
}

export function updateHero(game: FightersGame): void {
  const hero = game.hero;
  hero.age++;
  if (game.combatTick > hero.queueUntil) hero.attackQueue = 0;
  if (game.combatTick > hero.hitComboUntil) hero.hitCombo = 0;
  if (hero.hp <= 0) { hero.state = 'down'; return; }
  if (hero.state === 'hurt') {
    moveOnFloor(hero, hero.vx / 60, 0, game.stage); hero.vx *= .85;
    if (hero.age >= 22) { hero.state = 'idle'; hero.age = 0; }
    return;
  }
  if (hero.state === 'dodge') {
    moveOnFloor(hero, hero.vx / 60, hero.vy / 60, game.stage);
    if (hero.age >= HERO.dodgeTicks) { hero.state = 'idle'; hero.age = 0; }
    return;
  }
  if (hero.state === 'special') {
    if (hero.age === 12) {
      for (const enemy of game.enemies) if (enemy.x >= game.cameraX - 16 && enemy.x <= game.cameraX + 496) damageEnemy(game, enemy, 3, 145);
      game.projectiles = [];
      effect(game, 'wave', hero.x, hero.y - 35, '', 54);
      effect(game, 'ink', hero.x + hero.facing * 30, hero.y - 26, '', 30);
      effect(game, 'ring', hero.x, hero.y - 40, '', 34);
      effect(game, 'shock', hero.x, hero.y, '', 46);
      for (let i = 0; i < 5; i++) effect(game, 'spark', hero.x + (i - 2) * 34, hero.y - 44, '', 26);
      game.hitstop = 6;
    }
    if (hero.age >= 42) { hero.state = 'idle'; hero.age = 0; }
    return;
  }
  if (game.pendingDodge && game.combatTick >= hero.dodgeReadyAt) {
    game.pendingDodge = false;
    const d = direction(game.input.x || (game.input.y ? 0 : hero.facing), game.input.y);
    hero.state = 'dodge'; hero.age = 0; hero.vx = d.x * HERO.dodgeSpeed; hero.vy = d.y * HERO.dodgeSpeed * .65;
    hero.invulnerableUntil = game.combatTick + 20; hero.dodgeReadyAt = game.combatTick + HERO.dodgeCooldown;
    hero.attackQueue = 0; recordStat(game, 'dodges');
    effect(game, 'bubbles', hero.x, hero.y - 12, '', 22);
    effect(game, 'dust', hero.x - d.x * 10, hero.y, '', 20, { vx: -d.x * 20, vy: -8 });
    return;
  }
  game.pendingDodge = false;
  if (game.pendingSpecial && hero.gauge >= 100) {
    game.pendingSpecial = false; hero.gauge = 0; hero.state = 'special'; hero.age = 0;
    hero.invulnerableUntil = game.combatTick + 46; hero.attackQueue = 0; recordStat(game, 'specials');
    return;
  }
  game.pendingSpecial = false;
  if (hero.state === 'attack') {
    const attack = ATTACKS[clamp(hero.combo - 1, 0, 2)]!;
    if (hero.attackId !== game.whiffAttackId && hero.age >= attack.windup && hero.age < attack.windup + attack.active) {
      for (const enemy of game.enemies) {
        const dx = (enemy.x - hero.x) * hero.facing;
        if (enemy.hp <= 0 || hero.hitIds.includes(enemy.id) || Math.abs(enemy.y - hero.y) > 18
          || dx < (hero.combo === 3 ? -35 : -9) || dx > attack.range) continue;
        hero.hitIds.push(enemy.id); damageEnemy(game, enemy, attack.damage, attack.knockback);
      }
      if (hero.hitIds.length > 0 && hero.combo === 3 && hero.age === attack.windup + 1) {
        effect(game, 'ring', hero.x + hero.facing * 34, hero.y - 34, '', 30);
      }
    }
    if (hero.age >= attack.windup + attack.active + attack.recovery) {
      if (hero.hitIds.length === 0 && hero.attackId !== game.whiffAttackId) {
        recordStat(game, 'misses');
        effect(game, 'dust', hero.x + hero.facing * 28, hero.y - 36, '', 18, { vx: hero.facing * 18, vy: -6 });
      }
      hero.state = 'idle'; hero.age = 0;
    } else return;
  }
  // The direction held on the same tick as the attack decides its facing. Pausing input
  // until after beginAttack() made a same-tick "left + J" swing the wrong way.
  const d = direction(game.input.x, game.input.y);
  if (d.x !== 0) hero.facing = d.x < 0 ? -1 : 1;
  if (hero.attackQueue > 0) { beginAttack(game); return; }
  moveOnFloor(hero, d.x * HERO.walkSpeed / 60, d.y * HERO.depthSpeed / 60, game.stage);
  if ((d.x || d.y) && game.combatTick % 22 === 0) effect(game, 'dust', hero.x - hero.facing * 6, hero.y, '', 16, { vy: -5 });
  const nextState = d.x || d.y ? 'walk' : 'idle';
  if (hero.state !== nextState) { hero.state = nextState; hero.age = 0; }
}

export function updateProjectiles(game: FightersGame): void {
  for (const projectile of game.projectiles) {
    projectile.age++; projectile.x += projectile.vx / 60; projectile.y += projectile.vy / 60;
    if (projectile.age > projectile.ttl || Math.abs(projectile.x - game.hero.x) > 16 || Math.abs(projectile.y - game.hero.y) > 12) continue;
    if (game.combatTick >= game.graceUntil) { damageHero(game, projectile.x); projectile.age = projectile.ttl + 1; }
  }
  game.projectiles = game.projectiles.filter(projectile => projectile.age <= projectile.ttl && projectile.x > -40 && projectile.x < game.stage.width + 40);
}
