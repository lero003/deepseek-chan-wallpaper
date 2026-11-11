import type { Enemy, Effect, FightersGame, Projectile } from './types.ts';
import { Painter, ellipse, panel, screenPanel } from './art-kit.ts';
import { BOSS, ENEMIES } from './definitions.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import { drawBoss as drawLumiereBoss } from './boss-art.ts';
import { arcadeUI } from './arcade.ts';

export const C = {
  ink: '#2f2b3d', inkSoft: '#453f52', paper: '#f3e8d4', paperShade: '#dfcfb2',
  gold: '#d8b37a', goldLight: '#f2d9a6', rose: '#c07f86', roseLight: '#e3aaa6',
  slimeDeep: '#43707f', slimeMid: '#68a0a6', slimeLight: '#a6cfc8', slimeGlow: '#e4f4ea',
  popupFrame: '#3a3448', popupPaper: '#f5ecd9', popupHeader: '#b5757d', popupHeaderDark: '#8e5c67',
  bossCoat: '#4a4660', bossCoatLight: '#625d7b', bossShirt: '#ece2cd', bossTie: '#b26e6c',
  skin: '#d9b7a0', hair: '#524248', hat: '#302e3d', hatBand: '#8d6870',
  shadow: '#2b3a44', white: '#fbf5e8', glow: '#ffe9bd', danger: '#d98a83',
} as const;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Four-point sparkle; `size` is the arm length in pixels. */
export function sparkle(p: Painter, x: number, y: number, size: number, color: string = C.goldLight, alpha = 1): void {
  const s = Math.max(1, Math.round(size));
  p.rect(x - .5, y - s, 1, s * 2 + 1, color, alpha);
  p.rect(x - s, y - .5, s * 2 + 1, 1, color, alpha);
  p.rect(x - 1, y - 1, 3, 3, C.white, alpha * .9);
}

export function drawShadow(p: Painter, x: number, y: number, halfWidth: number, alpha = .24): void {
  if (alpha <= .02) return;
  const w = Math.max(3, Math.round(halfWidth));
  p.rect(x - w, y, w * 2, 1, C.shadow, alpha * .8);
  p.rect(x - w + 3, y - 1, w * 2 - 6, 3, C.shadow, alpha);
}

// ---------------------------------------------------------------- enemies

const SLIME_TINTS = [
  { light: '#a6cfc8', mid: '#68a0a6', deep: '#43707f', glow: '#e4f4ea' },
  { light: '#b9d8ee', mid: '#7aa6cf', deep: '#4f6f9e', glow: '#e8f2ff' },
  { light: '#e6d3a8', mid: '#c4a36a', deep: '#8f7240', glow: '#fff2cf' },
] as const;
const POPUP_TINTS = [
  { paper: '#f5ecd9', header: '#b5757d', headerDark: '#8e5c67' },
  { paper: '#fbe9de', header: '#c8705f', headerDark: '#9c5148' },
  { paper: '#f8f2e0', header: '#b08a55', headerDark: '#8a6a3f' },
] as const;

export function drawSlime(p: Painter, e: Enemy, tick: number): void {
  const tint = SLIME_TINTS[e.variant];
  const scale = ENEMIES.slime[e.variant].scale;
  const exit = e.state === 'exit';
  const t = e.age;
  const cycle = (t % 46) / 46;
  let hop = e.state === 'move' ? Math.max(0, Math.sin(Math.PI * cycle)) * 7 : 0;
  let rx = 13 * scale, ry = 10 * scale, lean = 0, alpha = 1, squash = 0;
  if (e.state === 'windup') { rx = 15 * scale; ry = 8.2 * scale; squash = 2; }
  else if (e.state === 'strike') { rx = 14 * scale; ry = 9 * scale; lean = e.facing * 6; hop = 2; }
  else if (e.state === 'stunned') { rx = 16 * scale; ry = 6.6 * scale; squash = 2; }
  if (exit) { alpha = Math.max(0, 1 - t / 24); rx = Math.max(2, 11 - t * .18); ry = Math.max(2, 9 - t * .14); hop = t * 1.4; }
  if (alpha <= .02) return;
  const baseY = e.y - hop;
  const cx = e.x + lean;
  const top = baseY - ry * 2 + squash;

  ellipse(p, cx, top + ry, rx, ry, (row, rows) => {
    const v = row / rows;
    return v < .22 ? tint.light : v < .58 ? tint.mid : tint.deep;
  }, alpha);
  // Translucent inner core with a tiny "bug" heartbeat.
  if (!exit) {
    const pulse = 1 + Math.sin(t * .16) * .6;
    ellipse(p, cx - e.facing * 1, baseY - 5 * scale, 4 * pulse * scale, 3 * pulse * scale, tint.deep, alpha * .55);
    p.rect(cx - 1, baseY - 6, 2, 2, C.ink, alpha * .45);
  }
  // Rim light from the sunset window (always from the left).
  p.rect(cx - rx + 1, top + 4, 2, Math.max(1, Math.round(ry - 2)), tint.glow, alpha * .35);
  p.rect(cx + rx - 3, top + 5, 1, Math.max(1, Math.round(ry - 4)), tint.glow, alpha * .18);

  if (exit) {
    for (let i = 0; i < 4; i++) p.rect(cx + (i - 1.5) * 5, baseY - 8 - t * .5 - i * 2, 2, 2, tint.light, alpha * .8);
    return;
  }
  // Glitch pixels above the body.
  const glitch = Math.sin(tick * .12 + e.id) > .3;
  if (glitch) {
    p.rect(cx + 3, top - 3, 2, 1, tint.glow, alpha * .7);
    p.rect(cx + 6, top - 5, 1, 1, tint.light, alpha * .5);
  }
  // Face.
  const eyeY = top + ry - 3, face = e.facing;
  if (e.state === 'stunned' && e.age < 5) {
    ellipse(p, cx, top + ry, rx, ry, C.white, .45);
  }
  if (e.state === 'stunned') {
    for (const side of [-1, 1]) {
      const ex = cx + side * 4;
      p.rect(ex - 2, eyeY, 1, 1, C.ink, alpha); p.rect(ex + 1, eyeY, 1, 1, C.ink, alpha);
      p.rect(ex, eyeY, 1, 1, C.ink, alpha); p.rect(ex - 1, eyeY - 1, 1, 1, C.ink, alpha); p.rect(ex + 1, eyeY - 1, 1, 1, C.ink, alpha);
    }
  } else {
    const squint = e.state === 'windup' ? 1 : 0;
    for (const side of [-1, 1]) {
      const ex = cx + side * 4 + face;
      p.rect(ex - 1, eyeY - 1 + squint, 2, Math.max(1, 3 - squint), C.ink, alpha);
      p.rect(ex - 1, eyeY - 1 + squint, 1, 1, C.white, alpha);
    }
    if (e.state === 'strike') p.rect(cx - 2 + face, eyeY + 3, 5, 2, C.ink, alpha);
    else p.rect(cx - 1 + face, eyeY + 3, 3, 1, C.ink, alpha);
  }
}

export function drawPopup(p: Painter, e: Enemy): void {
  const tint = POPUP_TINTS[e.variant];
  const s = ENEMIES.popup[e.variant].scale;
  const t = e.age;
  const exit = e.state === 'exit';
  const bob = Math.sin(t * .1 + e.id) * 1;
  const shake = e.state === 'windup' ? Math.sin(t * .85) * 1.6 : 0;
  const lean = e.state === 'strike' ? e.facing * 4 : 0;
  const w = Math.round(30 * s), h = Math.round(24 * s);
  const top = e.y - 5 - h - bob + (e.state === 'stunned' ? 2 : 0);
  const left = Math.round(e.x - w / 2 + shake + lean);
  if (exit) {
    // Window folds shut with a little spin.
    const rows = 5, fade = Math.max(0, 1 - t / 22);
    for (let i = 0; i < rows; i++) {
      const shrink = Math.min(1, t / 10);
      const rw = Math.round(w * (1 - shrink * .55) * (1 - i * .08));
      const ox = Math.round(Math.sin(t * .5 + i) * 3 * shrink);
      p.rect(left + (w - rw) / 2 + ox, top + i * 4, rw, 2, i === 0 ? C.popupHeader : C.popupPaper, fade);
    }
    if (t < 12) p.rect(left + w / 2, top - 2, 1, 1, C.white, fade * .8);
    return;
  }
  const header = e.state === 'windup' ? C.gold : tint.header;
  panel(p, left, top, w, h, tint.paper, C.popupFrame);
  if (e.state === 'stunned' && e.age < 5) p.rect(left, top, w, h, C.white, .4);
  p.rect(left + 2, top + 2, w - 4, 6, header);
  p.rect(left + 2, top + 7, w - 4, 1, e.state === 'windup' ? C.goldLight : tint.headerDark);
  // Close button.
  const bx = left + w - 8, by = top + 3;
  for (let i = 0; i < 3; i++) {
    p.rect(bx + i, by + i, 1, 1, C.popupPaper);
    p.rect(bx + 2 - i, by + i, 1, 1, C.popupPaper);
  }
  // Body text lines.
  p.rect(left + 3, top + 11, 15, 1, '#bcaa95');
  p.rect(left + 3, top + 13, 11, 1, '#cdbca6');
  // Face.
  const eyeY = top + 18, face = e.facing, mid = left + w / 2;
  for (const side of [-1, 1]) {
    const ex = mid + side * 5 + face;
    if (e.state === 'stunned') {
      p.rect(ex - 1, eyeY, 1, 1, C.ink); p.rect(ex + 2, eyeY, 1, 1, C.ink); p.rect(ex, eyeY, 1, 1, C.ink);
      p.rect(ex + 1, eyeY - 1, 1, 1, C.ink); p.rect(ex - 2, eyeY + 1, 1, 1, C.ink);
    } else p.rect(ex, eyeY, 2, 2, C.ink);
  }
  if (e.state === 'strike') p.rect(mid - 2, top + 21, 6, 2, C.ink);
  else p.rect(mid - 1, top + 21, 4, 1, C.ink);
  if (e.state === 'stunned') {
    for (let i = 0; i < 3; i++) sparkle(p, left + 4 + i * 9, top - 4 - (i % 2) * 2, 2, C.goldLight, .8);
  }
  // Legs tap in idle, brace in windup.
  const step = Math.sin(t * .18 + e.id) > 0 ? 1 : 0;
  p.rect(left + 6, top + h, 3, 5 + step, C.popupFrame);
  p.rect(left + w - 9, top + h, 3, 5 - step + 1, C.popupFrame);
  p.rect(left + 4, top + h + 5 + step, 6, 2, C.popupFrame);
  p.rect(left + w - 12, top + h + 6 - step, 6, 2, C.popupFrame);
  if (e.state === 'windup') {
    p.rect(left + w / 2, top - 12, 1, 8, C.danger);
    p.rect(left + w / 2 - 1, top - 5, 3, 2, C.danger);
  }
}

export function drawBoss(p: Painter, e: Enemy, tick: number, appearance: RenderAppearance = {}): void {
  drawLumiereBoss(p, e, tick, appearance);
}

export function drawEnemy(p: Painter, e: Enemy, tick: number, appearance: RenderAppearance = {}): void {
  if (e.kind === 'slime') drawSlime(p, e, tick);
  else if (e.kind === 'popup') drawPopup(p, e);
  else drawBoss(p, e, tick, appearance);
}

export function drawProjectile(p: Painter, projectile: Projectile, tick: number): void {
  const wobble = Math.sin(tick * .2 + projectile.id) * 1;
  const x = Math.round(projectile.x - 9), y = Math.round(projectile.y - 40 + wobble);
  panel(p, x, y, 18, 10, C.popupPaper, C.popupFrame);
  p.rect(x + 2, y + 2, 3, 3, C.danger, .9);
  p.rect(x + 2, y + 2, 3, 1, C.popupPaper, .9);
  p.rect(x + 6, y + 2, 9, 1, '#b9a894', .9);
  p.rect(x + 6, y + 4, 6, 1, '#c4b49f', .8);
  p.rect(x + 2, y + 7, 13, 1, '#c4b49f', .8);
}

// ---------------------------------------------------------------- effects

function star(p: Painter, x: number, y: number, size: number, color: string, alpha: number): void {
  sparkle(p, Math.round(x), Math.round(y), size, color, alpha);
}

export function drawEffect(p: Painter, item: Effect, effectsLow: boolean): void {
  const t = item.age / item.ttl;
  const fade = Math.max(0, 1 - t);
  switch (item.kind) {
    case 'hit':
    case 'spark': {
      const size = item.kind === 'spark' ? 4 : 3;
      const burst = 1 + t * 1.6;
      for (let i = 0; i < (effectsLow ? 4 : 6); i++) {
        const angle = item.id * 1.7 + i * Math.PI / 3;
        const radius = (4 + t * 10) * burst;
        star(p, item.x + Math.cos(angle) * radius, item.y + Math.sin(angle) * radius * .8, size * fade + 1, i % 2 ? C.goldLight : C.white, fade);
      }
      p.rect(item.x - 2, item.y - 2, 5, 5, C.white, fade * .9);
      p.rect(item.x - 1, item.y - 1, 3, 3, C.gold, fade);
      if (item.text) p.text(item.x - item.text.length * 3.4, item.y - 20 - t * 7, item.text, C.paper, 7, fade);
      break;
    }
    case 'ring': {
      const radius = 6 + t * 26;
      const alpha = fade * .8;
      const left = Math.round(item.x - radius), right = Math.round(item.x + radius);
      const top = Math.round(item.y - radius * .6), bottom = Math.round(item.y + radius * .6);
      p.rect(left, top, radius * 2, 1, C.goldLight, alpha);
      p.rect(left, bottom, radius * 2, 1, C.goldLight, alpha);
      p.rect(left, top, 1, radius * 1.2, C.goldLight, alpha);
      p.rect(right, top, 1, radius * 1.2, C.goldLight, alpha);
      if (item.text) p.text(item.x - item.text.length * 3.6, item.y - 24 - t * 8, item.text, C.paper, 7, fade);
      break;
    }
    case 'shock': {
      for (let i = 0; i < 3; i++) {
        const radius = 8 + t * 38 - i * 6;
        if (radius < 3) continue;
        const alpha = fade * (.5 - i * .12);
        p.rect(item.x - radius, item.y - i, radius * 2, 1, i === 0 ? C.white : C.goldLight, alpha);
        p.rect(item.x - radius * .7, item.y - i - 1, radius * 1.4, 1, C.goldLight, alpha * .6);
      }
      break;
    }
    case 'bubbles': {
      for (let i = 0; i < (effectsLow ? 4 : 7); i++) {
        const drift = Math.sin(item.id + i * 1.3) * 5;
        const y = item.y - t * (14 + i * 3) - i * 2;
        const x = item.x + (i - 3) * 3 + drift;
        p.rect(x, y, 2 + (i % 2), 2, C.slimeLight, fade * .8);
        p.rect(x, y, 1, 1, C.slimeGlow, fade);
      }
      break;
    }
    case 'stars': {
      for (let i = 0; i < (effectsLow ? 3 : 5); i++) {
        const angle = item.id + i * 1.4 + t * 3;
        const radius = 5 + t * 16;
        star(p, item.x + Math.cos(angle) * radius, item.y + Math.sin(angle) * radius * .7, 2, C.goldLight, fade);
      }
      break;
    }
    case 'wave': {
      // Overdrive: a sweeping horizon wave, light shafts and a bright leading edge.
      const sweep = 30 + t * 620;
      for (let row = 0; row < 5; row++) {
        const y = 72 + row * 10 + Math.sin(t * 7 + row) * 2;
        p.screen(0, y, 480, 3, row % 2 ? C.slimeLight : C.goldLight, fade * (.42 - row * .06));
      }
      p.screen(Math.round(sweep), 58, 7, 118, C.white, fade * .28);
      p.screen(Math.round(sweep) - 3, 58, 13, 118, C.glow, fade * .12);
      p.screen(0, 60, 480, 1, C.white, fade * .5);
      for (let i = 0; i < (effectsLow ? 8 : 16); i++) {
        const x = (i * 61 + Math.round(t * 240)) % 500 - 10;
        const y = 66 + ((i * 37) % 110) + Math.sin(t * 6 + i) * 6;
        star(p, x + p.cameraX, y, i % 3 === 0 ? 3 : 2, i % 2 ? C.white : C.goldLight, fade * .85);
      }
      for (let i = 0; i < 7; i++) {
        const x = 24 + i * 68;
        p.screen(x, 84, 3, 96, C.glow, fade * (.20 - i * .012));
      }
      break;
    }
    case 'tea': {
      const x = Math.round(item.x), y = Math.round(item.y - t * 4);
      panel(p, x, y + 2, 12, 9, C.paper, C.ink, fade);
      p.rect(x + 12, y + 4, 3, 4, C.paper, fade);
      p.rect(x - 1, y + 11, 14, 2, C.gold, fade);
      p.rect(x + 3, y, 1, 3, C.white, fade * .5);
      p.rect(x + 6, y - 2, 1, 4, C.white, fade * .4);
      break;
    }
    case 'words': {
      const label = item.text || '……';
      const width = Math.min(180, Math.max(30, label.length * 7 + 10));
      const x = Math.round(item.x - width / 2), y = Math.round(item.y - t * 8);
      panel(p, x, y, width, 15, C.paper, C.ink, Math.min(1, fade * 1.6));
      p.rect(x + 8, y + 15, 4, 3, C.paper, Math.min(1, fade * 1.6));
      p.text(x + 5, y + 4, label, C.ink, 7, Math.min(1, fade * 1.6));
      break;
    }
    case 'dust': {
      for (let i = 0; i < 4; i++) {
        const x = item.x + (i - 1.5) * 6 + Math.sin(item.id + i) * 3;
        p.rect(x, item.y - t * 6 - (i % 2) * 2, 4, 3, '#c9b8a8', fade * .5);
      }
      break;
    }
    case 'confetti': {
      for (let i = 0; i < 5; i++) {
        const x = item.x + (i - 2) * 5 + Math.sin(item.id + i) * 4;
        const y = item.y - t * 20 - (i % 3) * 3;
        const color = [C.goldLight, C.roseLight, C.slimeLight, C.paper][(item.id + i) % 4]!;
        p.rect(x, y, 3, 2 - (i % 2), color, fade, (i + item.id) * .6);
      }
      break;
    }
    case 'ink': {
      for (let i = 0; i < 4; i++) {
        const angle = item.id + i * 1.6;
        const x = item.x + Math.cos(angle) * (4 + t * 12);
        const y = item.y + Math.sin(angle) * (4 + t * 9);
        p.rect(x, y, 3 - (i % 2), 2, '#384a63', fade * .7);
      }
      break;
    }
    case 'paper': {
      const w = 20, h = 14;
      const x = Math.round(item.x - w / 2), y = Math.round(item.y - t * 22);
      panel(p, x, y, w, h, C.white, C.inkSoft, fade);
      for (let i = 0; i < 3; i++) p.rect(x + 3, y + 3 + i * 3, w - 6 - i * 3, 1, '#a9a08f', fade * .9);
      break;
    }
    default: {
      break;
    }
  }
}

// ---------------------------------------------------------------- hero props

export function drawBookSwing(p: Painter, x: number, y: number, facing: number, progress: number, alpha = 1): void {
  const angle = facing * (-.5 + progress * 1.45);
  const lift = Math.sin(progress * Math.PI);
  const bx = x + facing * (15 + lift * 10), by = y - 54 - lift * 4 + progress * 6;
  // Motion trail first, so the book reads as the leading edge.
  for (let i = 2; i >= 0; i--) {
    const t = Math.max(0, progress - .10 - i * .07);
    const a = facing * (-.5 + t * 1.45);
    const cx = x + facing * (13 + Math.sin(t * Math.PI) * 9), cy = y - 54 + t * 6;
    p.rect(cx - 10, cy - 5, 20, 10, C.goldLight, alpha * (.16 - i * .045), a);
  }
  // Concentric rotated pieces share a centre and stay aligned.
  p.rect(bx - 13, by - 7, 26, 14, C.slimeDeep, alpha, angle);
  p.rect(bx - 11, by - 6, 22, 12, C.paper, alpha, angle);
  p.rect(bx - 9, by - 4, 18, 8, C.paperShade, alpha * .55, angle);
  p.rect(bx - 1, by - 6, 2, 12, C.inkSoft, alpha, angle);
  p.rect(bx + 7, by - 6, 2, 5, C.rose, alpha, angle);
  p.rect(bx - 13, by - 7, 26, 2, C.white, alpha * .5, angle);
}

export function drawQuillThrust(p: Painter, x: number, y: number, facing: number, progress: number, alpha = 1): void {
  const reach = 16 + progress * 30;
  const hy = y - 47;
  for (let i = 0; i < 4; i++) {
    const tx = x + facing * (reach - 6 - i * 9);
    p.rect(tx - facing * 6, hy - 2, facing * 14, 3, C.paper, alpha * (.34 - i * .07));
  }
  const hx = x + facing * reach;
  p.rect(hx - facing * 2, hy - 1, facing * 16, 3, C.white, alpha);
  p.rect(hx - facing * 3, hy - 3, facing * 3, 7, C.gold, alpha);
  // Feather fletching.
  p.rect(hx - facing * 9, hy - 7, facing * 8, 12, C.slimeMid, alpha, -facing * .35);
  p.rect(hx - facing * 8, hy - 5, facing * 6, 3, C.slimeLight, alpha, -facing * .35);
  p.rect(hx - facing * 7, hy + 3, facing * 5, 2, C.slimeDeep, alpha, -facing * .35);
  sparkle(p, hx + facing * 2, hy + 1, 2, C.goldLight, alpha * .8);
}

export function drawSpinStars(p: Painter, x: number, y: number, facing: number, progress: number, alpha = 1): void {
  const spin = progress * Math.PI * 2 + .4;
  for (let i = 0; i < 5; i++) {
    const angle = spin + i * (Math.PI * 2 / 5);
    const radius = 34;
    star(p, x + Math.cos(angle) * radius, y - 40 + Math.sin(angle) * 13, 2.4, i % 2 ? C.goldLight : C.white, alpha * .85);
  }
  p.rect(x - 30, y - 42, 60, 2, C.goldLight, alpha * .2);
  p.rect(x - 22, y - 36, 44, 1, C.paper, alpha * .28);
  // Tail flick.
  p.rect(x - facing * 18, y - 30, facing * 12, 3, C.slimeLight, alpha * .5);
}

export function drawSpecialAura(p: Painter, x: number, y: number, progress: number, effectsLow: boolean): void {
  const alpha = .5 + Math.sin(progress * Math.PI) * .5;
  for (let i = 0; i < (effectsLow ? 4 : 7); i++) {
    const offset = (i - 3) * 7;
    const height = 30 + Math.sin(i + progress * 6) * 10;
    p.rect(x + offset, y - height - 18, 2, height, C.glow, alpha * .18);
  }
  star(p, x - 8, y - 60, 3, C.white, alpha);
  star(p, x + 12, y - 48, 2, C.goldLight, alpha);
}

export function drawTeaCup(p: Painter, x: number, y: number, alpha = 1): void {
  panel(p, x, y, 11, 8, C.paper, C.ink, alpha);
  p.rect(x + 11, y + 2, 3, 4, C.paper, alpha);
  p.rect(x - 1, y + 8, 13, 2, C.gold, alpha);
  p.rect(x + 3, y - 3, 1, 2, C.white, alpha * .4);
  p.rect(x + 6, y - 5, 1, 3, C.white, alpha * .3);
}

/** Crescent slash arc; thin rotated segments read as a single swoosh. */
export function drawSlash(p: Painter, x: number, y: number, facing: number, progress: number, radius: number, color: string, alpha = 1): void {
  const spread = 1.5;
  const start = -spread * .6 + progress * .5;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const angle = facing * (start + t * spread) + (facing < 0 ? Math.PI : 0);
    const px = x + Math.cos(angle) * radius * facing;
    const py = y - 46 + Math.sin(angle) * radius * .62;
    const width = 9 - i * .8;
    p.rect(px - width / 2, py - 1, width, 2, color, alpha * (.55 - t * .34), angle + Math.PI / 2);
  }
  sparkle(p, x + facing * radius * .82, y - 48, 2, C.paper, alpha * .8);
}

// ---------------------------------------------------------------- HUD

export function drawHeart(p: Painter, x: number, y: number, filled: boolean, alpha = 1): void {
  const color = filled ? '#d98a94' : '#5d5468';
  p.screen(x + 1, y, 2, 1, color, alpha);
  p.screen(x + 5, y, 2, 1, color, alpha);
  p.screen(x, y + 1, 8, 3, color, alpha);
  p.screen(x + 1, y + 4, 6, 1, color, alpha);
  p.screen(x + 2, y + 5, 4, 1, color, alpha);
  p.screen(x + 3, y + 6, 2, 1, color, alpha);
  if (filled) p.screen(x + 1, y + 1, 2, 1, '#f4c9c4', alpha);
}

export function drawGauge(p: Painter, x: number, y: number, value: number, full: boolean, pulse: number, alpha = 1): void {
  p.screen(x, y, 108, 9, C.ink, alpha * .8);
  p.screen(x + 1, y + 1, 106, 7, '#4d4658', alpha);
  const segments = 21;
  for (let i = 0; i < segments; i++) {
    const on = (i + 1) / segments * 100 <= value;
    if (on) p.screen(x + 2 + i * 5, y + 2, 4, 5, full ? (pulse > .5 ? C.goldLight : C.gold) : C.slimeLight, alpha);
  }
  if (full) {
    p.screen(x - 1, y - 1, 110, 1, C.goldLight, alpha * (pulse * .7));
    p.screen(x - 1, y + 9, 110, 1, C.goldLight, alpha * (pulse * .5));
  }
}

export function drawBossBar(p: Painter, value: number, max: number, alpha = 1): void {
  const width = 168, x = 240 - width / 2, y = 32;
  p.screen(x - 2, y - 12, width + 4, 24, C.ink, alpha * .78);
  p.screen(x - 1, y - 11, width + 2, 22, '#413c50', alpha);
  p.screenText(x + 2, y - 9, BOSS.name, C.paper, 7, alpha);
  p.screenText(x + width - 26, y - 9, '残り', C.goldLight, 6, alpha * .6);
  p.screen(x + 2, y + 3, width - 4, 5, '#5b5368', alpha);
  const ratio = Math.max(0, Math.min(1, value / max));
  p.screen(x + 2, y + 3, (width - 4) * ratio, 5, ratio <= .3 ? C.danger : C.rose, alpha);
  p.screen(x + 2, y + 3, (width - 4) * ratio, 1, C.roseLight, alpha * .8);
  for (let i = 1; i < 6; i++) p.screen(x + 2 + (width - 4) * i / 6, y + 3, 1, 5, C.ink, alpha * .3);
}

export function drawCombo(p: Painter, combo: number, tick: number, alpha = 1): void {
  if (combo < 2) return;
  const label = `COMBO ×${combo}`;
  const size = combo > 9 ? 12 : 10;
  const width = Math.round(label.length * size * .62) + 16;
  p.screen(6, 36, width, 17, C.ink, alpha * .66);
  p.screen(7, 37, width - 2, 1, C.gold, alpha * .45);
  p.screenText(13, 40, label, combo > 9 ? C.goldLight : C.paper, size, alpha);
  if (combo >= 5 && Math.sin(tick * .3) > 0) p.screen(6, 36, 2, 17, C.white, alpha * .45);
}

export function drawStageBanner(p: Painter, title: string, subtitle: string, progress: number): void {
  const alpha = progress < .12 ? progress / .12 : progress > .85 ? Math.max(0, (1 - progress) / .15) : 1;
  if (alpha <= .02) return;
  const width = Math.max(184, Math.min(312, Math.max(title.length * 11, subtitle.length * 8) + 32));
  const height = subtitle ? 40 : 28;
  const x = Math.round(240 - width / 2), y = 52;
  p.screen(x, y, width, height, C.ink, alpha * .88);
  p.screen(x + 1, y + 1, width - 2, 1, C.gold, alpha * .75);
  p.screen(x + 1, y + height - 2, width - 2, 1, C.gold, alpha * .5);
  p.screenTextCentered(240, subtitle ? y + 8 : y + 9, title, C.paper, 11, alpha);
  if (subtitle) p.screenTextCentered(240, y + 25, subtitle, C.goldLight, 7, alpha * .92);
}

export function drawVignette(p: Painter): void {
  for (let i = 0; i < 3; i++) {
    p.screen(0, 0, 480, 2, C.ink, .12 + i * .03);
    p.screen(0, 268 - 2, 480, 2, C.ink, .12 + i * .03);
    p.screen(0, 0, 2, 270, C.ink, .10 + i * .03);
    p.screen(478, 0, 2, 270, C.ink, .10 + i * .03);
  }
}

export function drawMessage(p: Painter, text: string, alpha = 1): void {
  const width = Math.min(320, Math.max(40, text.length * 8 + 20));
  const x = Math.round(240 - width / 2), y = 244;
  p.screen(x, y, width, 18, C.ink, alpha * .82);
  p.screen(x + 1, y + 1, width - 2, 1, C.gold, alpha * .35);
  p.screenTextCentered(240, y + 5, text, C.paper, 8, alpha);
}

export function drawResultPanel(p: Painter, game: FightersGame): void {
  // Kept on the left so the returning heroine stays visible on the right.
  const arena = game.route === 'arena';
  const width = 252, height = arena ? 138 : 116, x = 18, y = arena ? 70 : 82;
  p.screen(x - 3, y - 3, width + 6, height + 6, C.ink, .55);
  screenPanel(p, x, y, width, height, C.paper, C.ink);
  p.screen(x + 1, y + 1, width - 2, 3, C.gold, .8);
  p.screenText(x + 16, y + 14, arena ? '3連戦、おつかれさま。' : 'お片付け、おしまい', C.ink, 12);
  p.screenText(x + 16, y + 32, arena ? `${BOSS.name}と、またいつか。` : '静かな書斎へ、おかえり。', C.inkSoft, 7);
  const stats = arena ? game.runStats : game.stats;
  const seconds = Math.round((arena ? game.runTicks : game.tick - game.routeTick) / 60);
  const offset = arena ? 20 : 0;
  if (arena) {
    const a = arcadeUI(game);
    p.screenText(x + 16, y + 46, `RANK ${a.rank}   SCORE ${a.score.toString().padStart(6, '0')}`, C.ink, 11);
  }
  p.screenText(x + 16, y + 50 + offset, `命中 ${stats.hits}　空振り ${stats.misses}　回避 ${stats.dodges}`, C.inkSoft, 6);
  p.screenText(x + 16, y + 61 + offset, `必殺 ${stats.specials}　被弾 ${stats.damageTaken}　所要 ${seconds}秒`, C.inkSoft, 6);
  if (arena) p.screenText(x + 16, y + 91, `最大コンボ ${game.arcade.bestCombo}　CONTINUE ${game.arcade.continues}`, C.inkSoft, 6);
  p.screen(x + 16, y + 74 + offset + (arena ? 7 : 0), width - 32, 1, C.inkSoft, .3);
  p.screenText(x + 16, y + 82 + offset + (arena ? 7 : 0), '「もう一戦」ではじめから', C.ink, 7);
  p.screenText(x + 16, y + 94 + offset + (arena ? 7 : 0), '「壁紙へ戻る」で夕凪の書斎へ', C.inkSoft, 6);
}

export { clamp01, ellipse, screenPanel };
