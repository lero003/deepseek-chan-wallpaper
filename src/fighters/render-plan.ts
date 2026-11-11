import { frameAt } from '../render/atlas.ts';
import type { SpriteAtlas } from '../render/atlas.ts';
import { scenePlan, motesFor } from '../render/scene-plan.ts';
import type { ScenePlan, Mote } from '../render/scene-plan.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import { ARENA, ATTACKS, BOSS } from './definitions.ts';
import { drawArenaHud } from './arena-presentation.ts';
import { gameUI } from './game.ts';
import { clamp } from './movement.ts';
import type { FightersGame } from './types.ts';
import { Painter } from './art-kit.ts';
import {
  C, drawShadow, drawEnemy, drawProjectile, drawEffect, drawBookSwing, drawQuillThrust, drawSpinStars,
  drawSpecialAura, sparkle, drawHeart, drawGauge, drawBossBar, drawCombo, drawStageBanner,
  drawVignette, drawResultPanel, drawSlash,
} from './art.ts';
import { drawSceneryAmbience, drawSceneryForeground, drawStudyAmbience, areaAt } from './scenery.ts';

export type OrderedActor = { kind: 'hero' } | { kind: 'enemy'; id: number; y: number };

/** Painter's algorithm source of truth: ground Y, then stable id. */
export function orderedActors(game: FightersGame): OrderedActor[] {
  const actors: OrderedActor[] = [{ kind: 'hero' }, ...game.enemies.map(enemy => ({ kind: 'enemy' as const, id: enemy.id, y: enemy.y }))];
  return actors.sort((a, b) => {
    const ay = a.kind === 'hero' ? game.hero.y : a.y;
    const by = b.kind === 'hero' ? game.hero.y : b.y;
    if (ay !== by) return ay - by;
    // Same ground line: keep the heroine readable in front of a boss.
    if (a.kind === 'hero') return 1;
    if (b.kind === 'hero') return -1;
    return a.id - b.id;
  });
}

const bannerFor = (game: FightersGame): { title: string; subtitle: string; duration: number } | null => {
  if (game.phase === 'intro') return { title: '第一幕　夕凪の書斎', subtitle: '海辺まで、ひと騒動', duration: 110 };
  if (game.phase === 'bossIntro') return { title: BOSS.title, subtitle: BOSS.name, duration: 130 };
  if (game.phase === 'victory') return { title: '静かな夕凪', subtitle: '', duration: 150 };
  return null;
};

export function gamePlan(game: FightersGame, atlas: SpriteAtlas, appearance: RenderAppearance = {}, decorations = true,
  presentation: 'preview' | 'wallpaper' = 'preview', motes: readonly Mote[] = motesFor(game.world.seed)): ScenePlan {
  const base = scenePlan(game.world, atlas, motes, appearance, decorations);
  const ui = gameUI(game);
  base.game = ui;
  // A manual game never turns the passive desktop surface into an input/HUD surface.
  if (presentation === 'wallpaper' && game.mode === 'manual') return base;
  const returningHome = game.route === 'arena' && game.phase === 'return' && game.phaseAge >= ARENA.teleportTick;
  const home = game.phase === 'rest' || game.phase === 'result' || returningHome;
  const roomRoute = game.route === 'room';
  const camera = home ? 120 : Math.round(game.cameraX);
  const p = new Painter(camera);
  const hero = game.hero;
  const tick = game.tick;
  const low = game.effectsLow;
  const shadowColor = appearance.shadowColor ?? C.shadow;

  /** Actors, projectiles and hit effects shared by the long route and the in-room incident. */
  function drawCast(painter: Painter): void {
    if (game.route === 'arena' && game.phase === 'bossIntro') {
      // The rival is already visible for the face-off, but cannot attack or be hit before
      // the director opens the round. This entrance is presentation only, not a live enemy.
      drawShadow(painter, ARENA.enemyX, ARENA.heroY, 24, .24);
      drawEnemy(painter, { id: 0, kind: 'boss', variant: 0, facing: -1, x: ARENA.enemyX, y: ARENA.heroY,
        hp: BOSS.hp, maxHP: BOSS.hp, state: 'move', age: game.phaseAge, readyAt: 0, pattern: 0, hit: false,
        targetX: ARENA.enemyX, vx: 0, vy: 0 }, tick, appearance);
    }
    const visible = game.enemies.filter(enemy => enemy.x > camera - 90 && enemy.x < camera + 570);
    const enemiesById = new Map(visible.map(enemy => [enemy.id, enemy] as const));
    for (const actor of orderedActors(game)) {
      if (actor.kind === 'hero') {
        drawShadow(painter, hero.x, hero.y, hero.state === 'down' ? 20 : 15, .26);
        drawHero(painter);
        continue;
      }
      const enemy = enemiesById.get(actor.id);
      if (!enemy) continue;
      drawShadow(painter, enemy.x, enemy.y, enemy.kind === 'boss' ? 27 : enemy.kind === 'popup' ? 14 : 13,
        enemy.state === 'exit' ? .14 : .24);
      drawEnemy(painter, enemy, tick, appearance);
      // 思索のステップ is a straight lunge: mark the floor lane it will take, so the
      // dash is a reaction test rather than an unreadable hit.
      if (game.route === 'arena' && enemy.kind === 'boss' && enemy.state === 'windup' && enemy.pattern % 4 === 2) {
        const dir = enemy.x <= hero.x ? 1 : -1, pulse = .3 + Math.sin(tick * .35) * .12;
        for (let i = 0; i < 4; i++) {
          painter.rect(enemy.x + dir * (30 + i * 26), enemy.y - 2, 20, 2, C.danger, pulse - i * .06);
        }
        painter.rect(enemy.x + dir * 20, enemy.y - 3, 7, 4, C.danger, pulse + .18);
      }
    }
  }

  function drawHero(painter: Painter): void {
    const blink = game.combatTick < hero.invulnerableUntil && game.combatTick % 8 < 3;
    const alpha = blink ? .45 : 1;
    let state: 'idle' | 'walk' | 'turn' | 'sleep' = hero.state === 'walk' ? 'walk' : hero.state === 'down' ? 'sleep' : 'idle';
    if (hero.state === 'attack' || hero.state === 'dodge') state = 'walk';
    let frame = frameAt(atlas, state, hero.age / 60);
    let rotation = 0, scaleY = 1, z = 0, x = hero.x;
    if (hero.state === 'attack') {
      const attack = ATTACKS[clamp(hero.combo - 1, 0, 2)]!;
      scaleY = hero.age < attack.windup ? .96 : 1;
      rotation = hero.facing * (hero.age < attack.windup ? -.06 : hero.combo === 3 ? Math.sin((hero.age - attack.windup) / 12 * Math.PI) * .26 : .08);
    }
    if (hero.state === 'special') {
      frame = atlas.animations.idle.frames[0]!;
      z = Math.sin(Math.min(1, hero.age / 42) * Math.PI) * 6;
      scaleY = 1.04; rotation = Math.sin(hero.age * .3) * .06;
    }
    if (hero.state === 'dodge') { z = Math.sin(hero.age / 18 * Math.PI) * 10; rotation = -hero.facing * .12; }
    if (hero.state === 'hurt') rotation = -hero.facing * .12;
    if (game.phase === 'victory') {
      frame = atlas.animations.turn.frames[1]!;
      if (game.phaseAge > 70 && game.phaseAge < 110) { x += Math.sin((game.phaseAge - 70) / 40 * Math.PI) * 16; rotation = .16; }
    }
    if (hero.state === 'dodge') {
      for (let i = 1; i <= 2; i++) painter.sprite(x - hero.facing * i * 9, hero.y - z, frame, hero.facing, .16 - i * .05, rotation, 1, scaleY);
    }
    if (hero.state === 'special') drawSpecialAura(painter, x, hero.y, Math.min(1, hero.age / 26), low);
    painter.sprite(x, hero.y - z, frame, hero.facing, alpha, rotation, 1, scaleY);
    if (hero.state === 'attack') {
      const attack = ATTACKS[clamp(hero.combo - 1, 0, 2)]!;
      const total = attack.windup + attack.active;
      const progress = clamp(hero.age / total, 0, 1);
      if (hero.age >= attack.windup) {
        if (hero.combo === 1) drawSlash(painter, x, hero.y, hero.facing, progress, 44, C.goldLight, alpha);
        else if (hero.combo === 2) drawSlash(painter, x, hero.y, hero.facing, progress, 52, C.paper, alpha);
        else drawSlash(painter, x, hero.y, hero.facing, progress, 60, C.white, alpha);
      }
      if (hero.combo === 1) drawBookSwing(painter, x, hero.y, hero.facing, progress, alpha);
      else if (hero.combo === 2) drawQuillThrust(painter, x, hero.y, hero.facing, progress, alpha);
      else if (hero.age >= attack.windup) drawSpinStars(painter, x, hero.y, hero.facing, progress, alpha);
    }
    if (hero.state === 'dodge' && !low) painter.rect(x - hero.facing * 4 - 6, hero.y - 4, 12, 2, C.paper, .2);
  }

  function drawCombatEffects(painter: Painter): void {
    for (const projectile of game.projectiles) {
      if (projectile.x < camera - 12 || projectile.x > camera + 492) continue;
      drawProjectile(painter, projectile, tick);
    }
    for (const item of game.effects) {
      if (item.x < camera - 10 || item.x > camera + 490) continue;
      drawEffect(painter, item, low);
    }
    // Heavy hits briefly warm the frame; no strobing.
    if (game.hitstop >= 4) painter.screen(0, 0, 480, 270, '#fff4d6', .05);
  }

  function drawReturnFade(painter: Painter): void {
    if (game.phase !== 'return') return;
    const age = game.phaseAge;
    const alpha = age < 60 ? age / 60 : age > 105 ? Math.max(0, (150 - age) / 45) : 1;
    painter.screen(0, 0, 480, 270, '#f6dcb4', alpha * .92);
  }

  if (home) {
    if (game.mode === 'manual' && (game.phase === 'result' || returningHome)) {
      // Seat the result beside the heroine, not over her face. This is presentation only:
      // the passive living world and its accepted movement range are never repositioned.
      base.x = clamp(352, game.world.range.left, game.world.range.right);
      base.frame = atlas.animations.idle.frames[0]!;
      base.facing = -1;
      base.state = 'idle';
      const shadows = base.quads.slice(-2), half = Math.round(atlas.frameWidth * .19);
      base.quads = [...base.quads.slice(0, -2),
        { ...shadows[0]!, x: base.x - half, width: half * 2 + 1 },
        { ...shadows[1]!, x: base.x - half + 4, width: half * 2 - 7 }];
    }
    if (decorations) {
      for (const item of game.effects) drawEffect(p, item, low);
      if (game.phase === 'rest' && Math.sin(tick * .03) > .55) sparkle(p, hero.x + 26, hero.y - 96, 1.6, C.goldLight, .45);
    }
    if (game.mode === 'manual' && game.phase === 'result') { drawResultPanel(p, game); drawVignette(p); }
    drawReturnFade(p);
    base.overlay = p.commands;
    return base;
  }

  // A wallpaper incident happens inside the accepted 480×270 study: keep the room backdrop,
  // skip the scrolling scenery and chapter HUD, and never scroll the camera.
  if (roomRoute) {
    base.quads = base.quads.slice(0, -2);
    drawCast(p);
    drawCombatEffects(p);
    drawReturnFade(p);
    base.battle = { cameraX: 0, commands: p.commands, room: true };
    return base;
  }

  // The accepted 480px home background becomes the centre of the route.
  base.quads = base.quads.slice(0, -2).map(quad => ({ ...quad, x: quad.x + 120 - camera }));
  for (const quad of base.quads) if (quad.color === shadowColor) quad.alpha *= .8;

  drawStudyAmbience(p, tick);
  drawSceneryAmbience(p, camera, tick);
  drawCast(p);
  drawCombatEffects(p);
  drawSceneryForeground(p, camera, tick);
  p.screen(0, 254, 480, 3, C.ink, .16);
  p.screen(0, 257, 480, 13, '#5d4753', .12);
  p.screen(0, 260, 480, 10, C.ink, .10);

  // Progress pips and the "GO" cue belong to the manual HUD only.
  if (game.mode === 'manual') drawManualHud();
  else drawAutoBanners();
  drawVignette(p);
  drawReturnFade(p);

  function drawAutoBanners(): void {
    const banner = bannerFor(game);
    if (banner) drawStageBanner(p, banner.title, banner.subtitle, game.phaseAge / banner.duration);
    if (game.tick < game.areaBannerUntil) {
      const area = areaAt(hero.x);
      drawStageBanner(p, area.name, area.subtitle, 1 - (game.areaBannerUntil - game.tick) / 150);
    }
  }

  function drawManualHud(): void {
    if (game.route === 'arena') {
      drawArenaHud(p, game, ui);
      if (game.phase === 'retry') drawRetryPanel();
      if (game.paused || !game.focused) drawPauseOverlay();
      return;
    }
    p.screen(6, 6, 124, 26, C.ink, .8);
    p.screenText(11, 9, 'DeepSeekちゃん', C.paper, 6, .9);
    for (let i = 0; i < 5; i++) drawHeart(p, 11 + i * 10, 18, i < hero.hp, 1);
    drawCombo(p, hero.hitCombo, tick, 1);
    p.screen(326, 6, 148, 26, C.ink, .8);
    p.screenText(332, 9, '夕凪', C.goldLight, 6, .95);
    const pulse = (Math.sin(tick * .25) + 1) / 2;
    drawGauge(p, 332, 16, hero.gauge, hero.gauge >= 100, pulse, 1);
    if (hero.gauge >= 100) p.screenText(446, 9, 'L!', C.paper, 6, .7 + pulse * .3);
    const boss = game.enemies.find(enemy => enemy.kind === 'boss' && enemy.hp > 0);
    if (boss) drawBossBar(p, boss.hp, boss.maxHP, 1);
    else {
      const width = 176, x = 240 - width / 2, y = 34;
      p.screen(x, y, width, 12, C.ink, .55);
      p.screenText(x + 6, y + 3, ui.areaName, C.paper, 6, .9);
      for (let i = 0; i < ui.sections; i++) {
        const px = x + width - 10 - (ui.sections - 1 - i) * 9;
        const done = i < ui.section, active = i === ui.section;
        p.screen(px, y + 4, 6, 4, done ? C.goldLight : active ? C.paper : '#6b6274', done || active ? .95 : .5);
      }
    }
    if (!game.sectionLocked && game.phase === 'battle' && game.section < ui.sections) drawGoCue();
    if (game.tick < game.areaBannerUntil) {
      const area = areaAt(hero.x);
      drawStageBanner(p, area.name, area.subtitle, 1 - (game.areaBannerUntil - game.tick) / 150);
    }
    const banner = bannerFor(game);
    if (banner) drawStageBanner(p, banner.title, banner.subtitle, game.phaseAge / banner.duration);
    if (game.phase === 'retry') drawRetryPanel();
    if (game.phase === 'result') drawResultPanel(p, game);
    if (game.paused || !game.focused) drawPauseOverlay();
  }

  function drawGoCue(): void {
    const pulse = .5 + Math.sin(tick * .18) * .5;
    const x = 430, y = 128;
    for (let i = 0; i < 3; i++) {
      const offset = i * 7 + pulse * 5;
      p.screen(x + offset, y - 8, 3, 16, C.goldLight, .35 + pulse * .45);
      p.screen(x + offset + 3, y - 5, 3, 10, C.paper, .25 + pulse * .35);
      p.screen(x + offset + 6, y - 2, 3, 4, C.white, .2 + pulse * .3);
    }
  }

  function drawRetryPanel(): void {
    const width = 250, x = 240 - width / 2, y = 104;
    p.screen(x - 3, y - 3, width + 6, 50, C.ink, .5);
    p.screen(x, y, width, 44, C.paper, 1);
    p.screen(x + 1, y + 1, width - 2, 2, C.gold, .8);
    p.screenText(x + 14, y + 9, game.route === 'arena'
      ? ui.arcade.timedOut ? `TIME UP　ROUND ${ui.round}` : `ROUND ${ui.round}　もう一度。`
      : 'ここから、もう一度。', C.ink, 9);
    p.screenText(x + 14, y + 24, '「このラウンドを再挑戦」で再開', C.inkSoft, 6);
    p.screenText(x + 14, y + 33, '「壁紙へ戻る」で夕凪へ', C.inkSoft, 6);
  }

  function drawPauseOverlay(): void {
    p.screen(0, 0, 480, 270, C.ink, .4);
    const width = 224, x = 240 - width / 2, y = 108;
    p.screen(x, y, width, 42, C.paper, 1);
    p.screen(x + 1, y + 1, width - 2, 2, C.gold, .8);
    p.screenText(x + 14, y + 9, game.paused ? 'ひと休み中' : 'プレビューを選んでください', C.ink, 9);
    p.screenText(x + 14, y + 25, game.paused ? 'Esc で再開' : 'クリックで操作を再開', C.inkSoft, 7);
  }

  base.battle = { cameraX: camera, commands: p.commands };
  return base;
}
