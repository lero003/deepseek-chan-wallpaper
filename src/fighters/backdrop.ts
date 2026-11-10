import type { Quad } from '../render/scene-plan.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';

/**
 * Placeholder side alcoves for the 720px stage. The accepted 480px home image
 * stays pixel-for-pixel in the centre; these only extend its wall, shelves and floor.
 * Generated once per viewport and cached by both renderers.
 */
export function extensionQuads(appearance: RenderAppearance): Quad[] {
  const quads: Quad[] = [];
  const rect = (x: number, y: number, width: number, height: number, color: string, alpha = 1) => {
    if (width > 0 && height > 0) quads.push({ x, y, width, height, color, alpha });
  };
  const channel = (hex: string, offset: number) => {
    const value = Number.parseInt(hex.slice(1), 16);
    const clamp = (n: number) => Math.max(0, Math.min(255, n));
    return ((clamp(((value >> 16) & 255) + offset) << 16) | (clamp(((value >> 8) & 255) + offset) << 8) | clamp((value & 255) + offset))
      .toString(16).padStart(6, '0');
  };
  const shift = (hex: string, offset: number) => `#${channel(hex, offset)}`;
  const wall = appearance.ceilingColor ?? '#3c3b4f';
  const floor = appearance.floorColor ?? '#866077';
  const warm = '#d79a8e';
  for (const left of [0, 600]) {
    const at = (offset: number) => left + offset;

    // Wall, wainscot and floor base. Colours are derived from the active profile so
    // the extension matches both the sunset room and the committed placeholder.
    rect(left, 0, 120, 196, wall);
    rect(left, 0, 120, 8, shift(wall, -12));
    rect(left, 8, 120, 2, shift(wall, 18), .45);
    for (let x = 12; x < 120; x += 18) rect(left + x, 10, 1, 138, shift(wall, -8), .35);
    rect(left, 148, 120, 4, shift(wall, 24), .8);
    rect(left, 152, 120, 44, shift(wall, 10));
    for (let x = 0; x < 120; x += 30) rect(left + x, 152, 1, 44, shift(wall, -6));
    rect(left, 194, 120, 3, shift(wall, 30));
    rect(left, 197, 120, 73, floor);

    // Floor boards receding toward the centre, lit from the sunset window.
    for (let y = 201; y < 270; y += 14) {
      const band = Math.min(14, 270 - y);
      rect(left, y, 120, 1, shift(floor, -22), .9);
      const step = ((y / 14) | 0) % 2 ? 26 : 52;
      for (let x = step; x < 120; x += 52) rect(left + x, y, 1, band, shift(floor, 10), .7);
      rect(left + 4, y + 2, 112, 1, shift(floor, 18), .18);
    }
    for (let i = 0; i < 7; i++) rect(left, 197 + i * 6, 120, 6, warm, .12 - i * .012);
    rect(left, 197, 120, 3, '#e8b394', .2);

    // Tall shelf: back panel, sides, shelves, books.
    const sx = at(4);
    rect(sx, 20, 112, 170, shift(wall, -10), .95);
    rect(sx + 2, 22, 108, 166, shift(wall, -2));
    rect(sx, 18, 112, 4, '#7d5f62');
    rect(sx, 186, 112, 4, '#7d5f62');
    rect(sx, 18, 4, 172, '#6b5257');
    rect(sx + 108, 18, 4, 172, '#6b5257');
    for (let row = 0; row < 4; row++) {
      const shelfY = 56 + row * 34;
      rect(sx + 4, shelfY, 104, 4, '#8a6a6a');
      rect(sx + 4, shelfY, 104, 1, '#b3908a', .8);
      rect(sx + 4, shelfY + 4, 104, 1, '#4b3f4b', .8);
      let x = 8;
      while (x < 104) {
        const width = 5 + ((x * 7 + row * 13) % 5);
        const height = 20 + ((x * 11 + row * 5) % 9);
        const color = ['#6f6a8f', '#a98e8c', '#587f88', '#a4767c', '#7d86a3', '#bda892'][(x + row) % 6]!;
        if (x + width > 104) break;
        rect(sx + x, shelfY - height, width, height, color);
        rect(sx + x, shelfY - height, width, 1, '#d8c3ad', .5);
        if (width > 6) {
          rect(sx + x + 1, shelfY - height + 4, width - 2, 1, '#e4d4bd', .55);
          rect(sx + x + 1, shelfY - height + 10, width - 2, 1, '#2f2b3d', .25);
        }
        x += width + 1 + ((x + row) % 2);
      }
    }

    // Framed seascape above the shelf.
    const fx = at(20);
    rect(fx, 26, 40, 26, '#8a6a6a');
    rect(fx + 2, 28, 36, 22, '#2f3f55');
    rect(fx + 2, 38, 36, 12, '#4b6b7e');
    rect(fx + 2, 38, 36, 1, '#d8a98a');
    rect(fx + 6, 40, 8, 2, '#e8c7a0', .8);
    rect(fx + 2, 28, 36, 4, '#6b5b7a');
    rect(fx + 6, 29, 3, 1, '#e9dfc9', .7);

    // Hanging lamp.
    const lx = at(74);
    rect(lx, 8, 1, 16, '#5b4a54');
    rect(lx - 7, 24, 15, 3, '#8a6a6a');
    rect(lx - 6, 27, 13, 8, '#d8b37a');
    rect(lx - 3, 35, 7, 1, '#f2d9a6');
    rect(lx - 2, 36, 5, 6, '#ffe9bd', .35);

    // A plant softening the join, and a small side cabinet.
    const px = at(92);
    rect(px, 150, 18, 10, '#6b5257');
    rect(px + 1, 152, 16, 8, '#8a6a6a');
    rect(px + 4, 128, 2, 22, '#5b7a62');
    rect(px + 8, 134, 2, 16, '#5b7a62');
    rect(px + 1, 122, 8, 6, '#6f9178');
    rect(px + 10, 126, 8, 5, '#83a68a');
    rect(px + 4, 118, 5, 5, '#93b596');
    rect(px + 12, 120, 6, 4, '#6f9178');

    // Small cabinet with a tea set.
    const cx = at(86);
    rect(cx, 166, 30, 26, '#7b5f62');
    rect(cx + 2, 168, 26, 22, '#8f6f70');
    rect(cx + 2, 178, 26, 1, '#5a4750');
    rect(cx + 12, 170, 6, 6, '#d8b37a');
    rect(cx + 14, 171, 2, 2, '#f2d9a6');

    // Warm window light spilling across this alcove.
    rect(left, 24, 120, 128, warm, .05);
    rect(left, 24, 120, 40, warm, .04);

    // Blend seam toward the photographed centre panel (kept inside this alcove).
    for (let i = 0; i < 6; i++) {
      const edge = left === 0 ? 117 - i * 3 : 600 + i * 3;
      rect(edge, 0, 3, 270, wall, .16 + i * .03);
    }
    const seam = left === 0 ? 118 : 600;
    rect(seam, 0, 2, 270, '#1d1928', .22);
  }
  return quads;
}
