import { ARENA, ARENA_ROUNDS, ENEMIES, LIMITS } from './definitions.ts';
import { damageHero, inBattle } from './combat.ts';
import { decision, effect } from './events.ts';
import { clamp, moveOnFloor } from './movement.ts';
import type { Enemy, EnemyKind, EnemyVariant, FightersGame } from './types.ts';

export function spawnEnemy(game: FightersGame, kind: EnemyKind, variant: EnemyVariant, x: number, y: number,
  facing: -1 | 1, entering = true): Enemy | null {
  if (game.enemies.length >= LIMITS.enemies) return null;
  // The arena's final roster is one boss, never summoned visitors or a duplicate boss.
  if (game.route === 'arena' && ARENA_ROUNDS[game.section]?.boss
    && (kind !== 'boss' || game.enemies.some(enemy => enemy.kind === 'boss'))) return null;
  if (game.route === 'arena') { x = clamp(x, ARENA.left, ARENA.right); y = clamp(y, ARENA.top, ARENA.bottom); }
  const stats = ENEMIES[kind][variant];
  const camera = game.cameraX;
  const fromLeft = facing === 1;
  const targetX = entering
    ? clamp(fromLeft ? camera + 60 + decision(game) * 150 : camera + 300 + decision(game) * 150, 40, game.stage.width - 40)
    : clamp(x, 40, game.stage.width - 40);
  const enemy: Enemy = { id: game.nextId++, kind, variant, x: clamp(x, 10, game.stage.width - 10), y: clamp(y, 224, 250),
    facing, hp: stats.hp, maxHP: stats.hp, state: entering ? 'enter' : 'move', age: 0,
    readyAt: game.combatTick + (entering ? 40 : 30), pattern: 0, hit: false, targetX, vx: 0, vy: 0 };
  game.enemies.push(enemy);
  effect(game, 'dust', enemy.x, enemy.y, '', 24, { vy: -6 });
  if (kind === 'popup') effect(game, 'spark', enemy.x, enemy.y - 26, '', 18);
  return enemy;
}

function shoot(game: FightersGame, enemy: Enemy, spread = 0, speed = 92): void {
  if (game.projectiles.length >= LIMITS.projectiles) return;
  const dx = game.hero.x - enemy.x, dy = game.hero.y - enemy.y + spread;
  const length = Math.max(1, Math.hypot(dx, dy * 2));
  game.projectiles.push({ id: game.nextId++, x: enemy.x, y: enemy.y, vx: dx / length * speed, vy: dy / length * speed * .66, age: 0, ttl: 200, text: '' });
}

export function updateEnemies(game: FightersGame): void {
  const hero = game.hero;
  for (const enemy of [...game.enemies]) {
    enemy.age++;
    if (enemy.state === 'exit') {
      moveOnFloor(enemy, enemy.vx / 60, 0, game.stage); enemy.vx *= .91;
      if (enemy.kind !== 'slime' && enemy.age % 14 === 0) effect(game, 'paper', enemy.x, enemy.y - 24, '', 32, { vx: (decision(game) - .5) * 40, vy: -30, gravity: 90 });
      if (enemy.kind === 'slime' && enemy.age % 6 === 0) effect(game, 'bubbles', enemy.x, enemy.y - 6, '', 20);
      continue;
    }
    if (enemy.state === 'enter') {
      const direction = enemy.targetX > enemy.x ? 1 : -1;
      const facing: -1 | 1 = direction === 1 ? 1 : -1;
      moveOnFloor(enemy, direction * Math.max(1.2, ENEMIES[enemy.kind][enemy.variant].speed * 1.9 / 60), 0, game.stage);
      enemy.facing = facing;
      if (Math.abs(enemy.targetX - enemy.x) < 5 || enemy.age > 150) { enemy.state = 'move'; enemy.age = 0; enemy.readyAt = game.combatTick + 18; }
      continue;
    }
    if (enemy.state === 'stunned') {
      moveOnFloor(enemy, enemy.vx / 60, 0, game.stage); enemy.vx *= .86;
      if (enemy.age >= 22) { enemy.state = 'move'; enemy.age = 0; enemy.readyAt = game.combatTick + 20; }
      continue;
    }
    if (!inBattle(game) || game.combatTick < game.graceUntil) continue;
    const dx = hero.x - enemy.x, dy = hero.y - enemy.y;
    enemy.facing = dx < 0 ? -1 : 1;
    const stats = ENEMIES[enemy.kind][enemy.variant];
    const enraged = enemy.kind === 'boss' && enemy.hp <= enemy.maxHP / 2;
    if (enemy.state === 'move') {
      const desiredRange = enemy.kind === 'slime' ? 30 : game.route === 'arena' ? 48 : enemy.kind === 'popup' ? 106 : 92;
      moveOnFloor(enemy, Math.abs(dx) > desiredRange ? Math.sign(dx) * stats.speed / 60 : 0,
        Math.abs(dy) > 5 ? Math.sign(dy) * 14 / 60 : 0, game.stage);
      if (Math.abs(dx) <= desiredRange + 20 && Math.abs(dy) < 18 && game.combatTick >= enemy.readyAt) {
        if (enemy.kind === 'popup' && enemy.variant === 0 && decision(game) < .10) {
          enemy.hp = 0; enemy.state = 'exit'; enemy.age = 0; enemy.vx = 15;
          effect(game, 'ink', enemy.x, enemy.y - 18, '', 26); game.lastProgressAt = game.tick;
        } else { enemy.state = 'windup'; enemy.age = 0; enemy.hit = false; enemy.vx = 0; enemy.vy = 0; }
      }
    } else if (enemy.state === 'windup' && enemy.age >= stats.windup * (enraged ? .8 : 1)) {
      enemy.state = 'strike'; enemy.age = 0; enemy.hit = false;
      if (enemy.kind === 'slime') enemy.vx = enemy.facing * (enemy.variant === 1 ? 190 : enemy.variant === 2 ? 120 : 150);
      if (enemy.kind === 'popup') {
        const shots = enemy.variant === 1 ? 2 : enemy.variant === 2 ? 3 : 1;
        for (let i = 0; i < shots; i++) shoot(game, enemy, (i - (shots - 1) / 2) * 11, enemy.variant === 2 ? 76 : 92);
        enemy.vx = -enemy.facing * 20;
      }
      if (enemy.kind === 'boss') {
        const phase = enemy.pattern % 4;
        if (phase === 0) {
          const count = enraged ? 5 : 4;
          for (let i = 0; i < count; i++) shoot(game, enemy, (i - (count - 1) / 2) * 12, 90 + i * 6);
        } else if (phase === 1) {
          if (game.route === 'arena') {
            // 琥珀の連句: a faster fan replaces summoning, preserving the one-on-one.
            const count = enraged ? 5 : 3;
            for (let i = 0; i < count; i++) shoot(game, enemy, (i - (count - 1) / 2) * 18, 116);
            effect(game, 'ring', enemy.x, enemy.y - 36, '', 32);
          } else {
            spawnEnemy(game, 'slime', enraged ? 2 : 0, enemy.x - 60, 234, 1);
            spawnEnemy(game, 'popup', enraged ? 1 : 0, enemy.x + 60, 246, -1);
            if (enraged) spawnEnemy(game, 'slime', 1, enemy.x + 110, 244, -1);
          }
          effect(game, 'shock', enemy.x, enemy.y, '', 30);
        } else if (phase === 2) {
          enemy.vx = Math.sign(dx || 1) * (enraged ? 210 : 170); enemy.vy = clamp(dy, -16, 16);
        } else {
          for (let i = 0; i < 6; i++) shoot(game, enemy, (i - 2.5) * 9, 72);
          effect(game, 'paper', enemy.x, enemy.y - 40, '', 40, { vx: 10, vy: -30, gravity: 80 });
        }
      }
    } else if (enemy.state === 'strike') {
      if (enemy.kind === 'slime') {
        moveOnFloor(enemy, enemy.vx / 60, 0, game.stage); enemy.vx *= .9;
        if (!enemy.hit && Math.abs(dx) < 44 + (enemy.variant === 2 ? 8 : 0) && Math.abs(dy) <= 18) { damageHero(game, enemy.x); enemy.hit = true; }
      }
      if (enemy.kind === 'boss' && enemy.pattern % 4 === 2 && enemy.age < 24) {
        moveOnFloor(enemy, enemy.vx / 60, enemy.vy / 60, game.stage);
        if (!enemy.hit && Math.abs(dx) < 46 && Math.abs(dy) < 20) { damageHero(game, enemy.x); enemy.hit = true; }
      }
      if (enemy.age >= (enemy.kind === 'boss' ? 34 : 16)) {
        enemy.state = 'move'; enemy.age = 0; enemy.pattern++; enemy.vx = 0;
        enemy.readyAt = game.combatTick + Math.round((stats.cooldown + decision(game) * 22) * (enraged ? .64 : 1));
      }
    }
  }
  // Body separation keeps the heroine readable in a crowded brawl.
  for (const enemy of game.enemies) {
    if (enemy.state === 'exit') continue;
    const dx = enemy.x - hero.x, dy = enemy.y - hero.y;
    const minGap = enemy.kind === 'boss' ? 40 : 20;
    if (Math.abs(dx) < minGap && Math.abs(dy) < 12) {
      const push = (minGap - Math.abs(dx)) * (dx < 0 ? -1 : 1) * .4;
      moveOnFloor(enemy, push, 0, game.stage);
    }
  }
  game.enemies = game.enemies.filter(enemy => enemy.state !== 'exit' || enemy.age < 26);
}
