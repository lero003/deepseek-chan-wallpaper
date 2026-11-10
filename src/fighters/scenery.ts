import type { Quad } from '../render/scene-plan.ts';
import type { Painter } from './art-kit.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import { extensionQuads } from './backdrop.ts';
import { AREAS } from './definitions.ts';
import { sparkle } from './art.ts';

export const TERRACE_LEFT = 720;
export const STAGE_RIGHT = 3600;
const HORIZON = 132;
const RAIL_TOP = 172;
const RAIL_BOTTOM = 196;
const DECK_TOP = 196;
const SUN_X = 1046;
const SUN_Y = 84;

const SKY = ['#2b2348', '#332a50', '#3d3159', '#4a3a62', '#59426b', '#6d4c72', '#845879', '#9d677e', '#b77782', '#cf8a86', '#e29e8c', '#f0b393', '#f8c7a0'];
const SEA = ['#d9a08e', '#a97f92', '#7c6188', '#5c4f7c', '#454268'];

function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16), pb = Number.parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

const rectInto = (quads: Quad[]) => (x: number, y: number, width: number, height: number, color: string, alpha = 1) => {
  if (width > 0 && height > 0) quads.push({ x, y, width, height, color, alpha });
};

function ellipseRows(rect: ReturnType<typeof rectInto>, cx: number, cy: number, rx: number, ry: number, color: string, alpha = 1): void {
  const rows = Math.max(2, Math.round(ry * 2));
  for (let row = 0; row < rows; row++) {
    const t = ((row + .5) / rows) * 2 - 1;
    const half = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * rx);
    if (half >= 1) rect(cx - half, cy - ry + row, half * 2, 1, color, alpha);
  }
}

function groundShadow(rect: ReturnType<typeof rectInto>, cx: number, cy: number, rx: number): void {
  ellipseRows(rect, cx, cy, rx, 3, '#3a2c38', .28);
  ellipseRows(rect, cx, cy - 1, rx * .7, 2, '#3a2c38', .2);
}

function sky(rect: ReturnType<typeof rectInto>): void {
  // Dense interpolation keeps the sunset smooth instead of striped.
  const bands = 44;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const scaled = t * (SKY.length - 1);
    const index = Math.min(SKY.length - 2, Math.floor(scaled));
    const color = mix(SKY[index]!, SKY[index + 1]!, scaled - index);
    const top = Math.round(i / bands * HORIZON), bottom = Math.round((i + 1) / bands * HORIZON);
    rect(720, top, STAGE_RIGHT - 720, bottom - top, color, 1);
    if (i % 3 === 0) rect(720, bottom - 1, STAGE_RIGHT - 720, 1, mix(color, '#ffffff', .08), .35);
  }
  // Cloud banks repeated with variation so long stretches never look tiled.
  const strip = (cx: number, cy: number, width: number, height: number, body: string, rim: string, alpha: number) => {
    for (let row = 0; row < height; row++) {
      const t = (row / Math.max(1, height - 1)) * 2 - 1;
      const half = Math.round(width * .5 * Math.sqrt(Math.max(0, 1 - t * t * .8)));
      if (half < 2) continue;
      rect(cx - half, cy - height / 2 + row, half * 2, 1, body, alpha);
    }
    rect(cx - width * .32, cy - height / 2 - 1, width * .64, 1, rim, alpha * .8);
  };
  const banks = [
    [900, 58, 260, 9], [1230, 46, 210, 7], [1352, 74, 150, 6], [806, 88, 140, 5], [1050, 104, 300, 5],
    [1660, 52, 230, 8], [1980, 40, 180, 7], [2120, 88, 260, 5], [2420, 62, 200, 6],
    [2740, 48, 210, 7], [2980, 92, 240, 5], [3260, 60, 190, 6], [3470, 80, 160, 5],
  ] as const;
  for (const [cx, cy, width, height] of banks) strip(cx, cy, width, height, '#7a5068', '#d7958a', .45);

  // Sun, halo and its long reflection.
  for (let i = 7; i >= 1; i--) {
    const r = 12 + i * 5;
    ellipseRows(rect, SUN_X, SUN_Y, r, r, '#ffd9a0', .04);
  }
  ellipseRows(rect, SUN_X, SUN_Y, 24, 22, '#ffe3b4', .96);
  ellipseRows(rect, SUN_X - 4, SUN_Y - 4, 16, 14, '#fff4d6', .95);

  // Distant shoreline chain with tiny town lights.
  const shore = (cx: number, width: number, height: number, color: string) => {
    const base = HORIZON + 1;
    for (let row = 0; row < height; row++) {
      const t = (row / height) * 2 - 1;
      const half = Math.round(width * .5 * Math.sqrt(Math.max(0, 1 - t * t * .55)));
      const wobble = Math.round(Math.sin(t * 5 + cx) * 2);
      rect(cx - half + wobble, base - height + row, half * 2, 1, color, 1);
    }
  };
  const islands = [[830, 240, 9], [1226, 340, 11], [1720, 210, 8], [2050, 300, 10], [2520, 260, 9], [2860, 330, 12], [3210, 240, 8], [3500, 190, 7]] as const;
  for (const [cx, width, height] of islands) {
    shore(cx, width, height, '#3b2f52');
    for (let x = cx - width * .3; x < cx + width * .3; x += 11) {
      const h = 2 + ((x * 7) % 4);
      rect(x, HORIZON - h, 4, h, '#3b2f52', 1);
    }
  }
  rect(1212, 100, 3, 14, '#3b2f52');
  rect(1210, 97, 7, 3, '#6d5a78');
  rect(1213, 98, 2, 3, '#ffd9a0', .95);
  for (let i = 0; i < 90; i++) {
    const x = 740 + ((i * 131) % 2840);
    const y = HORIZON - 4 - (i % 4) * 2;
    rect(x, y, 1, 1, '#ffd9a0', .4 + (i % 3) * .2);
  }

  // Water and the sun path.
  for (let i = 0; i < SEA.length; i++) {
    const top = HORIZON + Math.round(i / SEA.length * (RAIL_TOP - HORIZON));
    const bottom = HORIZON + Math.round((i + 1) / SEA.length * (RAIL_TOP - HORIZON));
    rect(720, top, STAGE_RIGHT - 720, bottom - top, SEA[i]!, 1);
  }
  rect(720, HORIZON, STAGE_RIGHT - 720, 1, '#ffdcae', .95);
  for (let i = 0; i < 90; i++) {
    const y = HORIZON + 2 + ((i * 3) % 36);
    const width = 10 + (i * 11) % 36;
    rect(730 + ((i * 97) % 2860), y, width, 1, '#f0b8a8', .12);
  }
  for (let i = 0; i < 14; i++) {
    const y = HORIZON + 3 + i * 3;
    const width = 34 - i * 2;
    rect(SUN_X - width / 2 + Math.sin(i * .8) * 6, y, width, 1, '#ffe6bd', .3 - i * .016);
  }
  const boat = (bx: number, by: number, w: number) => {
    rect(bx, by, w, 2, '#2f2a3f');
    rect(bx + 2, by - 6, 1, 6, '#2f2a3f');
    rect(bx + 2, by - 6, 4, 3, '#f2d9a6', .8);
  };
  boat(878, HORIZON + 13, 18);
  boat(1236, HORIZON + 29, 13);
  boat(2140, HORIZON + 20, 15);
  boat(3050, HORIZON + 12, 20);
}

function terraceArea(rect: ReturnType<typeof rectInto>, left: number, right: number): void {
  // Railing.
  rect(left, RAIL_TOP, right - left, 4, '#43344a');
  rect(left, RAIL_TOP, right - left, 1, '#e0a58f', .9);
  rect(left, RAIL_BOTTOM - 3, right - left, 3, '#33283a');
  for (let x = left + 8; x < right; x += 44) {
    rect(x, RAIL_TOP + 4, 4, RAIL_BOTTOM - RAIL_TOP - 7, '#3a2d40');
    rect(x, RAIL_TOP + 4, 1, RAIL_BOTTOM - RAIL_TOP - 7, '#b98580', .75);
    rect(x - 2, RAIL_TOP - 2, 8, 2, '#4a3546');
    rect(x - 2, RAIL_TOP - 2, 3, 1, '#e0a58f', .6);
    for (let y = RAIL_TOP + 9; y < RAIL_BOTTOM - 5; y += 11) rect(x + 1, y, 2, 1, '#4f3c4e', .7);
  }
  // Deck.
  rect(left, DECK_TOP, right - left, 270 - DECK_TOP, '#9c6a6c');
  rect(left, DECK_TOP, right - left, 4, '#b98580');
  rect(left, DECK_TOP, right - left, 1, '#e8b49c', .7);
  for (let y = DECK_TOP + 5; y < 270; y += 12) {
    rect(left, y, right - left, 1, '#6e4a55', .95);
    const step = ((y / 12) | 0) % 2 ? 42 : 84;
    for (let x = left + step; x < right; x += 84) rect(x, y + 1, 1, Math.max(1, Math.min(11, 269 - y)), '#7f5560', .8);
    rect(left + 4, y + 2, right - left - 8, 1, '#c98f86', .12);
  }
  // Pergola beam, posts and festoon strings.
  rect(left, 30, right - left, 10, '#4a3348');
  rect(left, 30, right - left, 2, '#8a6274');
  rect(left, 38, right - left, 2, '#33263a');
  for (let x = left + 18; x < right; x += 118) {
    rect(x, 40, 5, 6, '#5a4350');
    rect(x, 40, 5, RAIL_BOTTOM - 40, '#5a4050');
    rect(x, 40, 1, RAIL_BOTTOM - 40, '#9a6f72', .6);
  }
  const bulbs = (x0: number, x1: number, sag: number) => {
    for (let t = 0; t <= 1.0001; t += .04) {
      const x = Math.min(right - 3, x0 + (x1 - x0) * t);
      const y = 48 + Math.sin(t * Math.PI) * sag;
      rect(x, y, 1, 1, '#2f2739', .9);
      if (Math.round(t * 24) % 3 === 0) {
        rect(x - 1, y + 1, 2, 2, '#ffe6b4', .95);
        rect(x - 2, y - 1, 4, 6, '#ffe9bd', .09);
      }
    }
  };
  bulbs(left + 8, left + 260, 18);
  bulbs(left + 260, left + 520, 22);
  bulbs(left + 520, left + 780, 16);
  bulbs(left + 780, right, 12);
  // Lamps, benches, planters.
  const lamp = (lx: number) => {
    rect(lx, 88, 3, RAIL_BOTTOM - 88, '#2f2739');
    rect(lx, 88, 1, RAIL_BOTTOM - 88, '#6b5b6e', .7);
    rect(lx - 6, 82, 15, 3, '#2f2739');
    rect(lx - 4, 77, 11, 5, '#d8b37a');
    rect(lx - 2, 74, 7, 3, '#f2d9a6');
    rect(lx - 20, 68, 45, 44, '#ffe9bd', .06);
    ellipseRows(rect, lx, DECK_TOP + 14, 34, 7, '#ffd9a0', .1);
  };
  for (const lx of [left + 100, left + 396, left + 660, left + 860]) { lamp(lx); groundShadow(rect, lx, DECK_TOP + 4, 12); }
  const bench = (bx: number) => {
    const seat = DECK_TOP - 16;
    rect(bx, seat, 100, 4, '#8a6a6a');
    rect(bx, seat, 100, 1, '#c9a294', .8);
    rect(bx, seat + 4, 100, 2, '#4f3c4e');
    rect(bx + 4, seat + 6, 4, DECK_TOP - seat - 6, '#3a2d40');
    rect(bx + 92, seat + 6, 4, DECK_TOP - seat - 6, '#3a2d40');
    rect(bx, seat - 14, 100, 3, '#7d5f62');
    rect(bx + 2, seat - 11, 96, 1, '#b3908a', .7);
    for (let x = bx + 8; x < bx + 92; x += 12) rect(x, seat - 11, 2, 11, '#43344a');
  };
  bench(left + 230);
  bench(left + 700);
  for (const bx of [left + 230, left + 700]) groundShadow(rect, bx + 50, DECK_TOP + 3, 56);
  const planter = (px: number) => {
    rect(px, 178, 24, 14, '#5a4350');
    rect(px + 1, 180, 22, 12, '#7d5f62');
    rect(px + 1, 180, 22, 1, '#b3908a', .7);
    rect(px + 10, 160, 2, 18, '#5b7a62');
    rect(px + 2, 154, 10, 7, '#6f9178');
    rect(px + 12, 150, 11, 6, '#83a68a');
    rect(px + 6, 144, 8, 7, '#93b596');
    rect(px + 4, 146, 4, 2, '#cfe3c4', .85);
  };
  for (const px of [left + 42, left + 540, left + 800]) { planter(px); groundShadow(rect, px + 12, DECK_TOP + 3, 16); }
}

function promenadeArea(rect: ReturnType<typeof rectInto>, left: number, right: number): void {
  // Stone balustrade.
  rect(left, RAIL_TOP - 2, right - left, 5, '#8f7d8c');
  rect(left, RAIL_TOP - 2, right - left, 1, '#e0b79f', .8);
  rect(left, RAIL_BOTTOM - 4, right - left, 4, '#5f4d5c');
  for (let x = left; x < right; x += 120) {
    rect(x, RAIL_TOP - 8, 16, RAIL_BOTTOM - RAIL_TOP + 10, '#7d6a7a');
    rect(x + 2, RAIL_TOP - 6, 12, RAIL_BOTTOM - RAIL_TOP + 6, '#665468');
    rect(x, RAIL_TOP - 8, 16, 3, '#a88f96');
    rect(x + 3, RAIL_TOP + 2, 3, RAIL_BOTTOM - RAIL_TOP - 2, '#8f7d8c');
    rect(x + 9, RAIL_TOP + 2, 3, RAIL_BOTTOM - RAIL_TOP - 2, '#8f7d8c');
    for (let bx = x + 16; bx < x + 120; bx += 16) rect(bx, RAIL_TOP + 2, 3, RAIL_BOTTOM - RAIL_TOP - 6, '#7d6a7a');
  }
  // Paved walk with alternating stone tones and a warm sunset wash.
  rect(left, DECK_TOP, right - left, 270 - DECK_TOP, '#7f6773');
  rect(left, DECK_TOP, right - left, 4, '#9a818c');
  rect(left, DECK_TOP, right - left, 1, '#e0b79f', .7);
  for (let y = DECK_TOP + 6; y < 270; y += 14) {
    const band = Math.min(14, 270 - y);
    rect(left, y, right - left, 1, '#5d4a58', .9);
    const step = ((y / 14) | 0) % 2 ? 46 : 92;
    for (let x = left + step; x < right; x += 92) rect(x, y, 1, band, '#6c5766', .85);
    rect(left + 5, y + 3, right - left - 10, 1, '#c39a92', .12);
  }
  // Flower beds, benches, lamps and arches.
  const bed = (bx: number) => {
    const top = DECK_TOP - 20;
    rect(bx, top, 92, 20, '#5f4d5c');
    rect(bx + 2, top + 2, 88, 16, '#6f5a68');
    rect(bx + 2, top + 2, 88, 1, '#a88f96', .7);
    for (let i = 0; i < 9; i++) {
      const x = bx + 6 + i * 9;
      const h = 8 + (i % 3) * 3;
      rect(x, top - h, 2, h, '#4f6b58');
      rect(x - 1, top - h - 2, 4, 3, i % 2 ? '#c07f86' : '#d8a779');
    }
    rect(bx + 20, top - 12, 30, 5, '#6f9178');
    rect(bx + 30, top - 16, 20, 4, '#83a68a');
  };
  bed(left + 70);
  bed(left + 430);
  bed(left + 700);
  for (const bx of [left + 70, left + 430, left + 700]) groundShadow(rect, bx + 46, DECK_TOP + 4, 54);
  const bench = (bx: number) => {
    const seat = DECK_TOP - 18;
    rect(bx, seat, 92, 4, '#8f6f70');
    rect(bx, seat + 4, 92, 2, '#4f3c4e');
    rect(bx + 4, seat + 6, 4, DECK_TOP - seat - 6, '#3a2d40');
    rect(bx + 84, seat + 6, 4, DECK_TOP - seat - 6, '#3a2d40');
    rect(bx, seat - 14, 92, 3, '#7d5f62');
    for (let x = bx + 8; x < bx + 84; x += 12) rect(x, seat - 11, 2, 10, '#43344a');
  };
  bench(left + 300);
  bench(left + 600);
  for (const bx of [left + 300, left + 600]) groundShadow(rect, bx + 46, DECK_TOP + 4, 50);
  const lamp = (lx: number) => {
    rect(lx, 84, 3, RAIL_BOTTOM - 84, '#3a2f45');
    rect(lx, 84, 1, RAIL_BOTTOM - 84, '#8a6a7a', .7);
    rect(lx - 8, 76, 19, 3, '#3a2f45');
    rect(lx - 5, 70, 13, 6, '#d8b37a');
    rect(lx - 3, 67, 9, 3, '#f2d9a6');
    rect(lx - 24, 62, 53, 48, '#ffe9bd', .06);
    ellipseRows(rect, lx, DECK_TOP + 16, 36, 7, '#ffd9a0', .09);
  };
  for (const lx of [left + 40, left + 250, left + 560, left + 850]) { lamp(lx); groundShadow(rect, lx, DECK_TOP + 4, 12); }
  // Wooden arches give the promenade vertical rhythm.
  const arch = (ax: number) => {
    rect(ax, 62, 5, DECK_TOP - 62, '#7d5f62');
    rect(ax + 175, 62, 5, DECK_TOP - 62, '#7d5f62');
    rect(ax, 62, 180, 5, '#7d5f62');
    rect(ax, 61, 180, 1, '#b3908a', .8);
    for (let x = ax + 10; x < ax + 170; x += 20) rect(x, 68, 2, 8, '#5a4350');
    rect(ax + 88, 40, 6, 22, '#5a4350');
    rect(ax + 76, 34, 30, 6, '#8f6f70');
    rect(ax + 74, 30, 34, 4, '#b3908a', .5);
  };
  arch(left + 150);
  arch(left + 520);
  for (const ax of [left + 150, left + 520]) { groundShadow(rect, ax + 5, DECK_TOP + 4, 8); groundShadow(rect, ax + 175, DECK_TOP + 4, 8); }
  // Hanging flower baskets.
  const basket = (bx: number) => {
    rect(bx, 62, 2, 16, '#4f3c4e');
    rect(bx - 6, 78, 15, 7, '#6b5257');
    rect(bx - 4, 74, 11, 5, '#6f9178');
    for (let i = 0; i < 6; i++) rect(bx - 6 + i * 3, 82 + (i % 2) * 3, 3, 3, i % 2 ? '#c07f86' : '#d8a779');
  };
  for (const bx of [left + 90, left + 390, left + 690]) { basket(bx); groundShadow(rect, bx, DECK_TOP + 4, 7); }
}

function pierArea(rect: ReturnType<typeof rectInto>, left: number, right: number): void {
  // Post-and-rope railing.
  rect(left, RAIL_TOP - 4, right - left, 3, '#5a4350');
  rect(left, RAIL_TOP - 4, right - left, 1, '#c9a294', .7);
  for (let x = left; x < right; x += 90) {
    rect(x, 150, 7, RAIL_BOTTOM - 150, '#4f3a45');
    rect(x, 150, 2, RAIL_BOTTOM - 150, '#8f6f70', .8);
    rect(x - 2, 146, 11, 4, '#6b5257');
    // Rope sag between posts.
    for (let t = 0; t <= 1; t += .08) {
      const rx = x + t * 90;
      const ry = RAIL_TOP + 2 + Math.sin(t * Math.PI) * 8;
      rect(rx, ry, 2, 1, '#c9a294', .55);
    }
  }
  // Boardwalk with wide planks.
  rect(left, DECK_TOP, right - left, 270 - DECK_TOP, '#7f5759');
  rect(left, DECK_TOP, right - left, 4, '#a9786f');
  rect(left, DECK_TOP, right - left, 1, '#e0a58f', .6);
  for (let y = DECK_TOP + 6; y < 270; y += 15) {
    const band = Math.min(15, 270 - y);
    rect(left, y, right - left, 1, '#5f4149', .95);
    const step = ((y / 15) | 0) % 2 ? 58 : 116;
    for (let x = left + step; x < right; x += 116) rect(x, y, 1, band, '#745056', .85);
    rect(left + 6, y + 3, right - left - 12, 1, '#c08a86', .12);
  }
  // Mooring posts, crates, nets and lanterns.
  const post = (px: number) => {
    rect(px, 140, 10, RAIL_BOTTOM - 140, '#5a3f47');
    rect(px + 1, 140, 3, RAIL_BOTTOM - 140, '#8f6a6a', .7);
    rect(px - 2, 136, 14, 5, '#6b4a52');
    rect(px - 2, 136, 14, 1, '#b3908a', .6);
  };
  for (const px of [left + 60, left + 320, left + 580, left + 840]) { post(px); groundShadow(rect, px + 5, DECK_TOP + 3, 12); }
  const crate = (cx: number, size: number) => {
    const top = DECK_TOP - size;
    rect(cx, top, size, size, '#7d5f62');
    rect(cx + 1, top + 1, size - 2, size - 2, '#96716f');
    rect(cx + 1, top + 1, size - 2, 1, '#c9a294', .6);
    rect(cx + 1, top + 1, 1, size - 2, '#b3908a', .5);
    rect(cx + 1, top + size - 2, size - 2, 1, '#5a4350', .8);
  };
  crate(left + 190, 22);
  crate(left + 210, 16);
  crate(left + 620, 20);
  crate(left + 700, 26);
  for (const [cx, size] of [[left + 190, 22], [left + 620, 20], [left + 700, 26]] as const) groundShadow(rect, cx + size / 2, DECK_TOP + 3, size * .8);
  const lantern = (lx: number) => {
    rect(lx, 96, 2, 44, '#3a2f45');
    rect(lx - 6, 138, 15, 4, '#3a2f45');
    rect(lx - 4, 142, 11, 9, '#d8b37a');
    rect(lx - 2, 144, 7, 5, '#fff0cc');
    rect(lx - 14, 136, 31, 24, '#ffe9bd', .08);
  };
  for (const lx of [left + 130, left + 470, left + 780]) { lantern(lx); groundShadow(rect, lx, DECK_TOP + 4, 9); }
  // Ropes coiled on the boards.
  for (const rx of [left + 270, left + 540]) {
    ellipseRows(rect, rx, 206, 13, 4, '#c9a294', .5);
    ellipseRows(rect, rx, 205, 8, 2, '#8f6a6a', .6);
  }
}

/** Static scenery for the whole 3600px route. Cached by both renderers. */
export function sceneryQuads(appearance: RenderAppearance): Quad[] {
  const quads: Quad[] = [];
  const rect = rectInto(quads);
  quads.push(...extensionQuads(appearance));
  sky(rect);
  const byId = new Map(AREAS.map(area => [area.id, area] as const));
  const terrace = byId.get('terrace')!, promenade = byId.get('promenade')!, pier = byId.get('pier')!;
  terraceArea(rect, terrace.left, terrace.right);
  promenadeArea(rect, promenade.left, promenade.right);
  pierArea(rect, pier.left, pier.right);

  // Doorway frame from the study onto the terrace, drawn over the sky.
  const doorLeft = TERRACE_LEFT - 8, doorRight = TERRACE_LEFT + 40;
  rect(doorLeft, 0, 10, DECK_TOP, '#3a2f45');
  rect(doorLeft, 0, 10, 6, '#5b4760');
  rect(doorLeft + 2, 56, 6, DECK_TOP - 56, '#7d5f62');
  rect(doorLeft + 4, 56, 1, DECK_TOP - 56, '#b3908a', .5);
  rect(doorRight - 8, 56, 8, DECK_TOP - 56, '#7d5f62');
  rect(doorRight - 7, 56, 1, DECK_TOP - 56, '#b3908a', .5);
  rect(doorLeft, 50, doorRight - doorLeft, 7, '#5a4350');
  rect(doorLeft, 50, doorRight - doorLeft, 1, '#b3908a', .75);
  rect(doorLeft + 10, 56, 9, DECK_TOP - 56, '#6b4a62', .92);
  for (let y = 62; y < DECK_TOP; y += 18) rect(doorLeft + 10, y, 8, 2, '#8a6274', .75);
  rect(doorRight, DECK_TOP + 2, 56, 28, '#ffd9a0', .08);
  // Threshold, so the study floor reads as continuing into the terrace.
  rect(doorLeft - 2, DECK_TOP, doorRight - doorLeft + 4, 3, '#b98580');
  rect(doorLeft, DECK_TOP + 3, doorRight - doorLeft, 2, '#6e4a55');

  // Boundary trims between outdoor areas.
  for (const x of [terrace.right, promenade.right]) {
    rect(x - 3, RAIL_TOP - 6, 6, 270 - RAIL_TOP + 6, '#5f4d5c');
    rect(x - 2, RAIL_TOP - 6, 2, 270 - RAIL_TOP + 6, '#a88f96', .5);
    rect(x - 7, DECK_TOP, 14, 3, '#c39a92', .6);
  }
  return quads;
}

/** Animated atmosphere: shared sky/sea plus area-specific foreground. */
export function drawSceneryAmbience(p: Painter, camera: number, tick: number): void {
  const parallax = (x: number, factor: number) => x + camera * (1 - factor);
  // Drifting wisps.
  for (let i = 0; i < 10; i++) {
    const y = 24 + (i % 6) * 14;
    const drift = (tick * (1.8 + (i % 4) * .3)) % 720;
    const baseX = 740 + ((i * 331) % 2800) - drift;
    const width = 110 + (i * 41) % 150;
    p.rect(parallax(baseX, .26), y, width, 2, i % 3 ? '#8a5870' : '#5c4265', .14);
    p.rect(parallax(baseX + 16, .26), y + 2, width - 34, 1, i % 3 ? '#c0807f' : '#5c4265', .1);
  }
  // Sun flare.
  const pulse = .5 + Math.sin(tick * .03) * .5;
  for (let i = 0; i < 4; i++) {
    const r = 26 + i * 10;
    p.rect(parallax(SUN_X - r, .5), SUN_Y - r * .6, r * 2, 1, '#ffe0ac', .05 * pulse);
  }
  p.rect(parallax(SUN_X - 44, .5), SUN_Y - 1, 88, 2, '#fff2d2', .12 + pulse * .08);
  for (let i = 0; i < 4; i++) {
    const angle = -.62 + i * .2;
    p.rect(SUN_X - 2, SUN_Y + 10, 5, 220, '#ffe0ac', .026 + i * .006, angle);
  }
  // Sea glints across the whole route.
  for (let i = 0; i < 60; i++) {
    const drift = (tick * (4 + (i % 4) * 2) + i * 47) % 2860;
    const x = 730 + drift;
    const y = HORIZON + 2 + (i * 7) % 36;
    const width = 5 + (i * 5) % 16;
    p.rect(parallax(x, .55), y, width, 1, i % 3 === 0 ? '#fff0c8' : '#ffcf9e', .18 + (i % 3) * .1);
  }
  for (let i = 0; i < 12; i++) {
    const y = HORIZON + 3 + i * 3;
    const width = 32 - i * 2;
    p.rect(parallax(SUN_X - width / 2, .55), y, width, 1, '#ffe6bd', .24 - i * .013);
  }
  // Birds.
  for (let i = 0; i < 5; i++) {
    const x = 760 + ((tick * (7 + i * 2) + i * 520) % 2780);
    const y = 52 + i * 9 + Math.sin(tick * .05 + i * 2) * 4;
    const wing = Math.sin(tick * .2 + i) > 0 ? 1 : 0;
    p.rect(parallax(x, .3), y, 4, 1, '#2f2a3f', .6);
    p.rect(parallax(x + 4, .3), y - wing, 3, 1, '#2f2a3f', .6);
    p.rect(parallax(x - 3, .3), y - (1 - wing), 3, 1, '#2f2a3f', .6);
  }
  // Area-tinted foreground atmosphere.
  for (let i = 0; i < 10; i++) {
    const x = 740 + ((tick * (8 + i) + i * 260) % 2820);
    const y = 150 + (i * 37) % 100 + Math.sin(tick * .06 + i) * 5;
    if (i % 3 === 0) p.rect(x + camera * .1, y, 3, 2, '#e8b0a0', .4);
    else if (i % 3 === 1) p.rect(x + camera * .1, y, 2, 2, '#c9b06a', .35);
    else sparkle(p, x + camera * .1, y, 1.5, '#ffe9bd', .25 + Math.sin(tick * .11 + i) * .15);
  }
}

/** Foreground pieces: leaves, near planters and petals that pass in front of the actors. */
export function drawSceneryForeground(p: Painter, camera: number, tick: number): void {
  const sway = (x: number, i: number) => Math.sin(tick * .03 + i * 1.7 + x * .01) * 2;
  // Near-camera planting at the bottom edge: only the rim and foliage enter the frame.
  for (const [x, i] of [[880, 0], [1580, 1], [2300, 2], [3020, 3]] as const) {
    const px = Math.round(x + Math.sin(tick * .025 + i) * 1);
    p.rect(px - 26, 262, 52, 8, '#5a4350', .95);
    p.rect(px - 26, 262, 52, 1, '#a87f80', .8);
    p.rect(px - 24, 264, 48, 6, '#3f2f3a', .9);
    for (let leaf = 0; leaf < 10; leaf++) {
      const lx = px - 18 + ((leaf * 7) % 36);
      const ly = 246 - ((leaf * 5) % 16);
      const w = 4 + (leaf % 3);
      p.rect(lx, ly, w, 3, leaf % 3 === 0 ? '#5d7f66' : leaf % 2 ? '#3f5a4c' : '#4f6b58', .9, (leaf % 3 - 1) * .4);
      p.rect(lx + 1, ly, w - 2, 1, '#8fb08c', .5);
    }
    p.rect(px - 2, 240, 4, 22, '#3f5a4c', .9);
  }
  for (const [x, i] of [[742, 0], [884, 1], [1176, 2], [1332, 3], [1560, 4], [1720, 5], [2140, 6], [2660, 7], [3180, 8]] as const) {
    const offset = sway(x, i);
    p.rect(x - 1 + camera * .1, 40, 2, 18 + (i % 3) * 5, '#3a4a42', .65);
    for (let leaf = 0; leaf < 6; leaf++) {
      const lx = x + offset + ((leaf * 5) % 13) - 6;
      const ly = 44 + ((leaf * 7) % 18) + (i % 2) * 3;
      p.rect(lx + camera * .1, ly, 3 + (leaf % 2), 2, leaf % 3 === 0 ? '#5d7f66' : '#3f5a4c', .7, (leaf % 3 - 1) * .4);
    }
  }
}

export function areaAt(x: number): typeof AREAS[number] {
  return AREAS.find(area => x < area.right) ?? AREAS[AREAS.length - 1]!;
}

/** Warm window shafts and floor light inside the study. */
export function drawStudyAmbience(p: Painter, tick: number): void {
  const drift = Math.sin(tick * .02) * 3;
  for (let i = 0; i < 4; i++) {
    const x = 250 + i * 52 + drift;
    p.rect(x, 96, 12 + i * 3, 128, '#ffe6b4', .045);
    p.rect(x + 4, 120, 4, 92, '#fff0cc', .05);
  }
  const glow = .5 + Math.sin(tick * .05) * .5;
  for (let row = 0; row < 10; row++) {
    const t = row / 9;
    const half = Math.round((52 - t * 30) * .5 + 10);
    p.rect(340 - half, 228 + row, half * 2, 1, '#ffd9a0', .04 + (1 - t) * .05 * glow);
  }
  if (Math.sin(tick * .07) > .7) sparkle(p, 300 + Math.sin(tick * .3) * 30, 120, 2, '#fff0cc', .35);
}
