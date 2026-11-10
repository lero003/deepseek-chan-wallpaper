import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const rgba = (hex) => [...hex.replace('#', '').match(/../g).map((pair) => parseInt(pair, 16)), 255];

class Pixels {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }
  dot(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set(typeof color === 'string' ? rgba(color) : color, (y * this.width + x) * 4);
  }
  rect(x, y, width, height, color) {
    const value = typeof color === 'string' ? rgba(color) : color;
    for (let yy = Math.round(y); yy < Math.round(y + height); yy += 1) {
      for (let xx = Math.round(x); xx < Math.round(x + width); xx += 1) this.dot(xx, yy, value);
    }
  }
  line(x0, y0, x1, y1, color) {
    const distance = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let step = 0; step <= distance; step += 1) {
      this.dot(x0 + (x1 - x0) * step / distance, y0 + (y1 - y0) * step / distance, color);
    }
  }
  ellipse(cx, cy, rx, ry, color) {
    const value = typeof color === 'string' ? rgba(color) : color;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.dot(x, y, value);
      }
    }
  }
  polygon(points, color) {
    const minY = Math.min(...points.map((point) => point[1]));
    const maxY = Math.max(...points.map((point) => point[1]));
    for (let y = minY; y <= maxY; y += 1) {
      const intersections = [];
      for (let index = 0; index < points.length; index += 1) {
        const [x0, y0] = points[index];
        const [x1, y1] = points[(index + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) intersections.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
      }
      intersections.sort((a, b) => a - b);
      for (let index = 0; index + 1 < intersections.length; index += 2) {
        this.rect(Math.ceil(intersections[index]), y, Math.floor(intersections[index + 1]) - Math.ceil(intersections[index]) + 1, 1, color);
      }
    }
  }
  paste(image, x, y) {
    for (let yy = 0; yy < image.height; yy += 1) {
      for (let xx = 0; xx < image.width; xx += 1) {
        const offset = (yy * image.width + xx) * 4;
        if (image.data[offset + 3]) this.dot(x + xx, y + yy, image.data.subarray(offset, offset + 4));
      }
    }
  }
  png() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0); header.writeUInt32BE(this.height, 4);
    header[8] = 8; header[9] = 6;
    const rows = Buffer.alloc((this.width * 4 + 1) * this.height);
    for (let y = 0; y < this.height; y += 1) {
      Buffer.from(this.data.buffer, y * this.width * 4, this.width * 4).copy(rows, y * (this.width * 4 + 1) + 1);
    }
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

function chunk(name, data) {
  const bytes = Buffer.concat([Buffer.from(name), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0); bytes.copy(output, 4);
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}

// Texture is a coordinate hash: regenerating never depends on a clock or RNG.
function grain(x, y, salt = 0) {
  let hash = Math.imul(x + 151 + salt, 374761393) ^ Math.imul(y + 97, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function scene() {
  const p = new Pixels(480, 270);
  const ink = '#314e50';
  p.rect(0, 0, 480, 270, '#587775');
  p.rect(0, 0, 480, 17, '#3b5b5b');
  p.rect(0, 17, 480, 3, '#769089');
  p.rect(0, 20, 480, 176, '#617e77');
  for (let y = 22; y < 194; y += 1) {
    for (let x = 0; x < 480; x += 1) {
      if (grain(x, y) % 71 === 0) p.dot(x, y, '#6b867c');
      if (grain(x, y, 15) % 151 === 0) p.dot(x, y, '#55766f');
    }
  }
  // Deep timber-framed window. The coast remains deliberately low contrast.
  p.rect(84, 28, 318, 161, '#3e5c5a');
  p.rect(87, 25, 312, 166, '#a09a79');
  p.rect(90, 29, 306, 155, '#486965');
  const sky = ['#709899', '#81a49f', '#91afa5', '#a4b9a9', '#bcc4ae', '#d1c9ad'];
  sky.forEach((color, index) => p.rect(94, 33 + index * 15, 298, 16, color));
  p.rect(94, 119, 298, 64, '#7b9d96');
  p.ellipse(294, 77, 18, 18, '#c8c9ab');
  p.ellipse(294, 77, 15, 15, '#e3d6af');
  p.ellipse(294, 77, 12, 12, '#eee1be');
  const cloud = (x, y, width) => {
    p.rect(x + 5, y, width - 12, 2, '#c3cbb9');
    p.rect(x, y + 2, width, 3, '#ccd0bb');
    p.rect(x + 9, y + 5, width + 9, 1, '#c3cbb9');
  };
  cloud(116, 59, 46); cloud(195, 88, 35); cloud(323, 53, 48);
  p.polygon([[94, 126], [109, 122], [123, 122], [134, 116], [147, 113], [159, 117], [169, 117], [189, 127]], '#698b85');
  p.polygon([[308, 127], [331, 120], [346, 120], [353, 115], [367, 114], [392, 119], [392, 133]], '#70918a');
  p.rect(94, 129, 298, 54, '#739891');
  p.rect(94, 141, 298, 16, '#6c918b');
  p.rect(94, 157, 298, 26, '#5f8581');
  for (let index = 0; index < 110; index += 1) {
    const x = 96 + grain(index, 9) % 284;
    const y = 131 + grain(index, 4) % 49;
    p.rect(x, y, 2 + grain(index, 7) % 10, 1, y < 151 ? '#8ca99a' : '#71958b');
  }
  for (let y = 132; y < 170; y += 4) {
    const width = Math.round((y - 120) * 0.45);
    p.rect(294 - width / 2, y, width, 1, '#b6ba9e');
  }
  // A small headland and lighthouse, not a logo or borrowed illustration.
  p.polygon([[339, 131], [346, 127], [367, 125], [387, 131]], '#60817d');
  p.rect(359, 111, 5, 16, '#d0ceb0'); p.rect(358, 110, 7, 2, '#527674');
  p.rect(360, 105, 3, 5, '#dacba6'); p.rect(358, 104, 7, 2, '#527674');
  p.rect(361, 119, 1, 3, '#68877e');
  p.rect(92, 32, 3, 151, '#3e605e'); p.rect(391, 32, 3, 151, '#3e605e');
  p.rect(193, 30, 5, 155, '#526f65'); p.rect(195, 30, 1, 155, '#adb091');
  p.rect(296, 30, 5, 155, '#526f65'); p.rect(298, 30, 1, 155, '#adb091');
  p.rect(92, 99, 302, 4, '#5c786b'); p.rect(94, 99, 298, 1, '#abb090');
  p.rect(84, 184, 318, 7, '#b3ab84'); p.rect(81, 191, 324, 4, '#48665f');
  p.rect(85, 184, 316, 1, '#d0c39a');
  // Quiet objects along the wall: clock, shelves, and a tiny framed seascape.
  p.ellipse(42, 43, 14, 14, ink); p.ellipse(42, 43, 12, 12, '#b6b393');
  p.ellipse(42, 43, 10, 10, '#d3c9a5'); p.line(42, 43, 42, 36, '#63756a');
  p.line(42, 43, 47, 46, '#63756a'); p.dot(42, 43, ink);
  p.rect(14, 85, 59, 5, '#355857'); p.rect(12, 84, 63, 3, '#afa780');
  p.rect(17, 88, 3, 7, ink); p.rect(67, 88, 3, 7, ink);
  p.rect(14, 130, 59, 5, '#355857'); p.rect(12, 129, 63, 3, '#afa780');
  const bookColors = ['#a4826c', '#aeb29a', '#6c9390', '#b4a483', '#788e84'];
  const books = (startX, baseline, count, salt = 0) => {
    let x = startX;
    for (let index = 0; index < count; index += 1) {
      const width = 4 + grain(index, salt) % 4;
      const height = 14 + grain(index, salt + 4) % 11;
      p.rect(x, baseline - height, width, height, bookColors[(index + salt) % bookColors.length]);
      p.rect(x + 1, baseline - height + 3, width - 2, 1, '#c8b995');
      p.rect(x, baseline - 2, width, 1, '#4f6a62');
      x += width + 1;
    }
  };
  books(17, 84, 7, 3); books(20, 129, 5, 8);
  p.rect(58, 119, 8, 10, '#c8baa0'); p.rect(57, 117, 10, 3, '#d7c8a4');
  p.line(62, 117, 61, 103, '#426b61');
  p.ellipse(58, 108, 5, 2, '#8caa8a'); p.ellipse(65, 105, 4, 2, '#a6b58b');
  p.rect(422, 48, 35, 37, '#395957'); p.rect(425, 51, 29, 31, '#b3ac89');
  p.rect(428, 54, 23, 25, '#799a90'); p.rect(428, 68, 23, 11, '#547d7b');
  p.ellipse(444, 61, 4, 4, '#d0c7a3'); p.rect(429, 72, 15, 1, '#8ba397');
  // Ceiling beam and warm pendant lamp.
  p.rect(0, 0, 480, 7, '#2e4d4e'); p.rect(0, 7, 480, 2, '#849180');
  p.rect(127, 9, 2, 28, '#3e5b58');
  p.polygon([[121, 36], [135, 36], [142, 45], [114, 45]], '#b5aa80');
  p.rect(114, 45, 28, 3, '#d3c197'); p.rect(120, 48, 16, 2, '#e4d1a5');
  // Floor, boards, and a woven runner. Central walking plane stays clear.
  p.rect(0, 198, 480, 72, '#8a8d75');
  p.rect(0, 197, 480, 6, '#405e58'); p.rect(0, 203, 480, 2, '#abb091');
  const seams = [214, 232, 254, 269];
  seams.forEach((y) => { p.rect(0, y, 480, 1, '#65776a'); p.rect(0, y + 1, 480, 1, '#a0a48a'); });
  for (let row = 0; row < 4; row += 1) {
    const top = row === 0 ? 205 : seams[row - 1] + 2;
    const bottom = seams[row];
    for (let x = (row % 2) * 61; x < 480; x += 119) p.rect(x, top, 1, bottom - top, '#68796b');
  }
  for (let index = 0; index < 330; index += 1) {
    const x = grain(index, 41) % 480; const y = 207 + grain(index, 51) % 61;
    p.rect(x, y, 1 + grain(index, 44) % 5, 1, grain(index, 45) % 2 ? '#92977c' : '#808972');
  }
  p.rect(100, 225, 294, 24, '#687d70'); p.rect(103, 227, 288, 20, '#859580');
  p.rect(107, 230, 280, 14, '#748b78'); p.rect(110, 232, 274, 10, '#80937d');
  for (let x = 103; x < 393; x += 6) { p.rect(x, 225, 2, 1, '#b0b293'); p.rect(x, 249, 2, 2, '#b0b293'); }
  for (let x = 110; x < 386; x += 12) { p.dot(x, 229, '#b0b293'); p.dot(x, 245, '#b0b293'); }
  // Research desk is behind, rather than on, the character's ground plane.
  p.ellipse(397, 211, 58, 5, '#77846e');
  p.rect(345, 172, 5, 37, '#4b655b'); p.rect(443, 172, 5, 37, '#4b655b');
  p.rect(350, 177, 93, 12, '#9a9576'); p.rect(352, 179, 89, 1, '#b6ad86');
  p.rect(384, 182, 21, 2, '#5e7362');
  p.rect(339, 166, 115, 6, '#526d5e'); p.rect(337, 161, 119, 6, '#b1a882');
  p.rect(339, 161, 115, 1, '#ded0a1');
  p.polygon([[349, 156], [360, 154], [371, 157], [371, 161], [360, 158], [349, 160]], '#d7c9a6');
  p.line(360, 155, 360, 159, '#8c947c'); p.rect(352, 157, 5, 1, '#a2a38b');
  p.rect(383, 152, 9, 9, '#d0c4a0'); p.rect(391, 154, 3, 5, '#d0c4a0'); p.rect(392, 155, 1, 3, '#6a8678');
  p.rect(384, 151, 7, 2, '#e1d1aa'); p.rect(385, 151, 5, 1, '#6d7764');
  p.rect(413, 158, 20, 3, '#567267'); p.rect(422, 141, 2, 18, '#587365');
  p.line(423, 142, 415, 135, '#587365');
  p.polygon([[409, 133], [422, 133], [426, 141], [405, 141]], '#d1bd8d');
  p.rect(407, 141, 17, 2, '#e6d0a1');
  // Left floor plant is a genuine obstacle (ends at x=82).
  p.ellipse(50, 237, 29, 4, '#6b7e6b');
  p.polygon([[31, 213], [65, 213], [61, 237], [36, 237]], '#b49e7e');
  p.rect(29, 211, 38, 6, '#c4b08d'); p.rect(34, 213, 28, 2, '#d3bf97');
  p.line(48, 212, 48, 171, '#3c685d'); p.line(47, 203, 34, 186, '#3c685d');
  p.line(49, 198, 65, 181, '#3c685d');
  const leaf = (cx, cy, rx, ry, color) => {
    p.ellipse(cx, cy, rx, ry, '#3f6c5e'); p.ellipse(cx - 1, cy - 1, rx - 1, ry - 1, color);
    p.line(cx - rx + 2, cy + 1, cx + rx - 2, cy - 1, '#96aa83');
  };
  leaf(35, 184, 13, 6, '#729575'); leaf(60, 181, 14, 6, '#88a17d');
  leaf(44, 171, 8, 10, '#7d9e78'); leaf(33, 199, 11, 5, '#88a17d');
  leaf(65, 197, 12, 5, '#789873');
  // Low cabinet at right is the other walking-plane obstacle.
  p.ellipse(439, 239, 36, 3, '#71826d');
  p.rect(408, 205, 59, 31, '#45665c'); p.rect(404, 202, 66, 5, '#a5a07c');
  p.rect(412, 209, 51, 22, '#5b7966'); books(416, 231, 6, 14);
  p.rect(409, 234, 4, 5, '#3a5b54'); p.rect(460, 234, 4, 5, '#3a5b54');
  p.rect(419, 196, 29, 6, '#7d9480'); p.rect(421, 195, 27, 2, '#d0c3a0');
  p.rect(426, 190, 26, 5, '#aa9074'); p.rect(428, 189, 23, 2, '#cfbf9c');
  // A few quiet foreground details, well outside the clear walking strip.
  p.rect(12, 259, 40, 1, '#7b8871'); p.rect(430, 258, 26, 1, '#7b8871');
  p.ellipse(447, 255, 4, 2, '#b5b497'); p.rect(447, 253, 1, 3, '#d0c8a6');
  p.rect(0, 268, 480, 2, '#5c7366');
  return p.png();
}

// An original fan-art interpretation: blue hair, a whale tail, and a maid-like apron.
// It deliberately does not trace any existing illustration or use an official logo.
function whaleGirl(state, frame) {
  const p = new Pixels(48, 64);
  const C = {
    outline: '#223849', hairDark: '#31566e', hairMid: '#467a93', hairLight: '#79a8b9',
    skin: '#f3dcc4', skinShade: '#dfb99f', blush: '#e7a390', eye: '#1d2d3e', eyeLight: '#f6f2e3',
    dress: '#5d8da9', dressDark: '#446f88', dressLight: '#8db5c7',
    apron: '#eee8d7', apronShade: '#d2c8b1', ribbon: '#c56f6d', shoe: '#2a3e45',
  };
  const eyeSide = (cx, cy, blink) => {
    if (blink) {
      p.rect(cx, cy + 2, 4, 1, C.eye);
      p.dot(cx + 4, cy + 1, C.eye);
      return;
    }
    p.rect(cx, cy - 1, 4, 1, C.outline);
    p.rect(cx, cy, 3, 5, C.eye);
    p.dot(cx + 1, cy + 1, C.eyeLight);
    p.dot(cx + 2, cy + 4, '#7fa9bb');
  };
  const eyeFront = (cx, cy) => {
    p.rect(cx, cy - 1, 4, 1, C.outline);
    p.rect(cx, cy, 3, 5, C.eye);
    p.dot(cx, cy, C.eyeLight);
    p.dot(cx + 1, cy + 1, C.eyeLight);
    p.dot(cx + 2, cy + 4, '#7fa9bb');
  };

  if (state === 'sleep') {
    const breath = [0, 0, -1, -1][frame];
    const b = breath;
    // Curled tail and fan-shaped fluke resting on the floor.
    p.polygon([[9, 58], [11, 53], [16, 49], [21, 50], [22, 56], [17, 59], [9, 59]], C.outline);
    p.polygon([[10, 57], [12, 54], [16, 51], [19, 52], [20, 56], [16, 58], [10, 58]], C.dress);
    p.polygon([[10, 57], [5, 52], [2, 52], [3, 56], [1, 58], [7, 59]], C.outline);
    p.polygon([[9, 56], [6, 53], [4, 54], [5, 56], [3, 57], [7, 58]], C.dressLight);
    // A small seated body under a white apron.
    p.ellipse(27, 51 + b, 15, 8, C.outline);
    p.ellipse(27, 51 + b, 14, 7, C.dress);
    p.ellipse(28, 53 + b, 10, 5, C.apron);
    p.rect(19, 57 + b, 17, 1, C.apronShade);
    // Keep the tucked hem in contact with the floor even on the inhaled frame.
    p.rect(19, 59, 16, 1, C.apronShade);
    // Tilted head, eyes closed, a little bubble.
    p.ellipse(26, 34 + b, 13, 12, C.outline);
    p.ellipse(26, 34 + b, 12, 11, C.hairMid);
    p.ellipse(24, 30 + b, 9, 7, C.hairDark);
    p.ellipse(30, 38 + b, 8, 8, C.outline);
    p.ellipse(30, 38 + b, 7, 7, C.skin);
    p.polygon([[20, 30 + b], [38, 31 + b], [38, 34 + b], [35, 33 + b], [33, 37 + b], [30, 33 + b], [27, 36 + b], [24, 33 + b], [21, 35 + b]], C.hairMid);
    p.rect(22, 31 + b, 8, 2, C.hairLight);
    p.rect(31, 39 + b, 4, 1, C.eye);
    p.dot(35, 38 + b, C.eye);
    p.rect(35, 43 + b, 2, 1, C.eye);
    p.rect(32, 42 + b, 3, 1, C.blush);
    p.rect(15, 38 + b, 4, 9, C.hairDark);
    p.rect(18, 43 + b, 3, 6, C.hairMid);
    const bubble = (x, y) => {
      p.rect(x + 1, y, 1, 1, '#a9c9c7');
      p.rect(x, y + 1, 1, 1, '#a9c9c7');
      p.rect(x + 2, y + 1, 1, 1, '#a9c9c7');
      p.rect(x + 1, y + 2, 1, 1, '#a9c9c7');
    };
    bubble(38, 23 - frame * 2);
    bubble(42, 18 - frame * 2);
    return p;
  }

  const front = state === 'turn' && frame === 1;
  const bob = front ? 0 : state === 'walk' ? [0, -1, -1, 0, 1, 0][frame] : state === 'idle' ? [0, -1, 0, 1][frame] : 0;
  const stride = state === 'walk' ? [0, 1, 2, 1, 0, -1][frame] : 0;
  const blink = state === 'idle' && frame === 3;
  const b = bob;
  const top = 34 + b;

  if (front) {
    // Shoes and legs, kept behind the skirt.
    p.rect(17, 51, 3, 7, C.outline); p.rect(18, 51, 2, 6, C.skin);
    p.rect(28, 51, 3, 7, C.outline); p.rect(29, 51, 2, 6, C.skin);
    p.rect(16, 57, 6, 3, C.outline); p.rect(17, 57, 5, 2, C.shoe);
    p.rect(27, 57, 6, 3, C.outline); p.rect(28, 57, 5, 2, C.shoe);
    // A-line dress with a white apron.
    p.polygon([[18, top], [30, top], [34, top + 20], [14, top + 20]], C.outline);
    p.polygon([[19, top + 1], [29, top + 1], [32, top + 19], [16, top + 19]], C.dress);
    p.rect(17, top + 9, 2, 9, C.dressDark); p.rect(30, top + 9, 2, 8, C.dressDark);
    p.polygon([[21, top + 2], [27, top + 2], [29, top + 19], [19, top + 19]], C.apron);
    p.rect(20, top + 18, 8, 1, C.apronShade);
    p.rect(21, top + 1, 6, 2, C.apron);
    // Both sleeves and hands.
    for (const x of [15, 29]) {
      p.rect(x, top + 3, 4, 7, C.outline);
      p.rect(x + 1, top + 3, 2, 6, C.skin);
      p.rect(x, top + 1, 4, 4, C.outline);
      p.rect(x + 1, top + 2, 2, 3, C.dress);
      p.rect(x + 1, top + 8, 2, 1, C.skinShade);
    }
    p.rect(23, top + 2, 3, 2, C.ribbon);
    p.polygon([[23, top + 2], [19, top + 1], [19, top + 4]], C.ribbon);
    p.polygon([[26, top + 2], [30, top + 1], [30, top + 4]], C.ribbon);
    p.rect(24, top + 4, 1, 3, C.ribbon);
    p.rect(27, top + 4, 1, 3, C.ribbon);
    // Neck and head, symmetrical.
    p.rect(22, top - 3, 5, 4, C.skinShade);
    p.ellipse(24, 20 + b, 14, 14, C.outline);
    p.ellipse(24, 20 + b, 13, 13, C.hairMid);
    p.ellipse(22, 16 + b, 10, 8, C.hairDark);
    p.ellipse(24, 24 + b, 9, 10, C.outline);
    p.ellipse(24, 24 + b, 8, 9, C.skin);
    p.polygon([[15, 13 + b], [33, 13 + b], [33, 19 + b], [30, 18 + b], [28, 23 + b], [24, 18 + b], [20, 23 + b], [18, 18 + b], [15, 19 + b]], C.hairMid);
    p.rect(18, 14 + b, 12, 2, C.hairLight);
    p.rect(11, 20 + b, 3, 11, C.hairDark);
    p.rect(34, 20 + b, 3, 11, C.hairDark);
    p.polygon([[22, 9 + b], [20, 4 + b], [24, 4 + b], [26, 9 + b]], C.hairDark);
    p.rect(22, 6 + b, 2, 2, C.hairLight);
    eyeFront(18, 24 + b);
    eyeFront(27, 24 + b);
    p.rect(31, 29 + b, 3, 1, C.blush);
    p.rect(14, 29 + b, 3, 1, C.blush);
    p.rect(23, 29 + b, 1, 1, C.skinShade);
    p.rect(22, 31 + b, 2, 1, C.eye);
    p.dot(21, 30 + b, C.eye);
    return p;
  }

  // Tail, curving up behind the skirt.
  const sway = state === 'walk' ? [0, 1, 0, -1, 0, 1][frame] : (state === 'idle' && frame === 1 ? 1 : 0);
  p.polygon([[21, 47 + b], [15, 46 + b], [12, 42 + b], [10, 38 + b], [13, 37 + b], [16, 41 + b], [20, 44 + b]], C.outline);
  p.polygon([[20, 46 + b], [15, 45 + b], [13, 42 + b], [12, 39 + b], [13, 39 + b], [16, 42 + b], [20, 45 + b]], C.dressDark);
  p.polygon([[13, 39 + b], [8, 38 + b + sway], [3, 35 + b + sway], [1, 32 + b + sway], [2, 29 + b + sway], [5, 30 + b + sway], [9, 34 + b + sway], [11, 35 + b + sway], [13, 31 + b + sway], [16, 28 + b + sway], [19, 29 + b + sway], [17, 34 + b + sway], [14, 39 + b + sway]], C.outline);
  p.polygon([[13, 38 + b], [8, 37 + b + sway], [4, 35 + b + sway], [3, 32 + b + sway], [4, 31 + b + sway], [9, 35 + b + sway], [11, 36 + b + sway], [13, 33 + b + sway], [16, 30 + b + sway], [17, 31 + b + sway], [15, 35 + b + sway], [13, 38 + b + sway]], C.dress);
  p.rect(6, 33 + b + sway, 2, 1, C.dressLight);
  p.rect(15, 31 + b + sway, 2, 1, C.dressLight);
  // Legs and shoes behind the skirt.
  p.rect(24 - stride, 51, 3, 7, C.outline);
  p.rect(25 - stride, 51, 2, 6, C.skin);
  p.rect(30 + stride, 51, 3, 7, C.outline);
  p.rect(31 + stride, 51, 2, 6, C.skin);
  p.rect(22 - stride, 57, 6, 3, C.outline);
  p.rect(23 - stride, 57, 5, 2, C.shoe);
  p.rect(29 + stride, 57, 6, 3, C.outline);
  p.rect(30 + stride, 57, 5, 2, C.shoe);
  // Dress and apron.
  p.polygon([[21, top], [34, top], [36, top + 8], [39, top + 20], [15, top + 20], [18, top + 8]], C.outline);
  p.polygon([[22, top + 1], [33, top + 1], [35, top + 8], [37, top + 19], [17, top + 19], [19, top + 8]], C.dress);
  p.rect(19, top + 9, 2, 9, C.dressDark);
  p.rect(34, top + 9, 2, 8, C.dressDark);
  p.polygon([[24, top + 2], [31, top + 2], [33, top + 19], [22, top + 19]], C.apron);
  p.rect(24, top + 18, 9, 1, C.apronShade);
  p.rect(23, top + 1, 9, 2, C.apron);
  // The visible arm hangs in front of the apron.
  p.rect(35, top + 4, 4, 7, C.outline);
  p.rect(36, top + 4, 2, 6, C.skin);
  p.rect(36, top + 9, 2, 1, C.skinShade);
  p.rect(34, top + 2, 4, 4, C.outline);
  p.rect(35, top + 2, 3, 3, C.dress);
  // Ribbon bow at the collar.
  p.rect(27, top + 2, 3, 2, C.ribbon);
  p.polygon([[27, top + 2], [23, top + 1], [23, top + 4]], C.ribbon);
  p.polygon([[30, top + 2], [34, top + 1], [34, top + 4]], C.ribbon);
  p.rect(28, top + 4, 1, 3, C.ribbon);
  p.rect(30, top + 4, 1, 2, C.ribbon);
  // Neck and head.
  p.rect(28, top - 3, 3, 4, C.skinShade);
  p.ellipse(23, 21 + b, 14, 14, C.outline);
  p.ellipse(23, 21 + b, 13, 13, C.hairMid);
  p.ellipse(21, 17 + b, 10, 8, C.hairDark);
  p.rect(11, 25 + b, 4, 12, C.hairDark);
  p.rect(15, 30 + b, 3, 8, C.hairMid);
  p.rect(11, 30 + b, 1, 5, C.hairLight);
  p.ellipse(29, 24 + b, 9, 10, C.outline);
  p.ellipse(29, 24 + b, 8, 9, C.skin);
  p.polygon([[19, 14 + b], [37, 15 + b], [37, 19 + b], [34, 18 + b], [32, 23 + b], [29, 18 + b], [26, 22 + b], [23, 18 + b], [20, 22 + b]], C.hairMid);
  p.rect(22, 15 + b, 8, 2, C.hairLight);
  p.rect(37, 21 + b, 2, 8, C.hairMid);
  p.rect(37, 22 + b, 1, 4, C.hairLight);
  p.polygon([[22, 10 + b], [18, 5 + b], [22, 4 + b], [25, 7 + b], [26, 10 + b]], C.hairDark);
  p.polygon([[22, 8 + b], [20, 6 + b], [22, 6 + b], [24, 8 + b]], C.hairLight);
  eyeSide(29, 24 + b, blink);
  if (state === 'idle' && frame === 2) {
    p.rect(34, 30 + b, 2, 2, '#9f5b5f');
    p.dot(34, 30 + b, C.eye);
  } else {
    p.rect(34, 30 + b, 2, 1, C.eye);
  }
  p.rect(31, 29 + b, 3, 1, C.blush);
  return p;
}

export function generateAssets() {
  const files = new Map();
  files.set('assets/scene/seaside-room.png', scene());
  const sheet = new Pixels(192, 256);
  const states = [['idle', 4, 320], ['walk', 6, 120], ['turn', 2, 250], ['sleep', 4, 500]];
  let next = 0;
  const animations = {};
  for (const [state, count, frameDurationMs] of states) {
    const frames = [];
    for (let index = 0; index < count; index += 1) {
      sheet.paste(whaleGirl(state, index), (next % 4) * 48, Math.floor(next / 4) * 64);
      frames.push(next++);
    }
    animations[state] = { frames, frameDurationMs };
  }
  files.set('assets/character/sheet.png', sheet.png());
  const atlas = {
    version: 1, image: 'sheet.png', frameWidth: 48, frameHeight: 64, columns: 4, rows: 4,
    anchor: { x: 24, y: 60 }, animations,
  };
  files.set('assets/character/atlas.json', Buffer.from(JSON.stringify(atlas, null, 2) + '\n'));
  files.set('assets/brand/whale-mark.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="#9fc2c1" d="M11 9h13v2h4v4h2v9h-3v3H13v-2H9v-3H5v-3H2v-7h3v3h4v-3h2z"/><path fill="#d9e1d2" d="M14 21h14v3h-3v2H15z"/><path fill="#2e5364" d="M24 15h2v3h-2zM17 20h3v5h-3z"/><path fill="#9fc2c1" d="M16 3h2v4h-2zM12 2h2v2h-2zM20 1h2v2h-2z"/></svg>\n'));
  const descriptions = {
    'assets/scene/seaside-room.png': ['A03', '海辺の書斎・静的背景', '480×270px', '色面、板目、棚、窓、海を整数座標で独自に描画。'],
    'assets/character/sheet.png': ['A01', 'クジラ娘・独自ドット絵 16コマ', '192×256px / 48×64px ×16', '青系の髪、クジラの尾、メイド風エプロンを整数座標で独自描画。既存イラストの複製や公式ロゴは不使用。'],
    'assets/character/atlas.json': ['A02', 'アニメーション配置と足元アンカー', 'UTF-8 JSON', 'idle 4 / walk 6 / turn 2 / sleep 4。'],
    'assets/brand/whale-mark.svg': ['A04-web', 'Web試作用の独自クジラマーク', '32×32 viewBox', '公式ロゴに基づかない整数座標の独自図形。Mac配布アイコンではない。'],
  };
  const manifest = {
    schemaVersion: 1,
    createdOn: '2026-11-10',
    releaseGate: 'private-prototype-only',
    thirdPartyCharacterArtIncluded: false,
    fanInterpretation: true,
    note: 'コードと画像の利用条件は別。公開・再配布ライセンスは未設定。DeepSeekちゃんをモチーフにした独自の非公開ファンアート解釈であり、権利者による許諾や公式素材の利用を示す台帳ではない。',
    assets: [...files].map(([path, data]) => ({
      id: descriptions[path][0], path, name: descriptions[path][1], dimensions: descriptions[path][2],
      author: '本プロジェクト内で制作（OpenAI Codexによるプログラム描画支援）',
      source: 'scripts/generate-art.mjs', sourceUrl: null,
      license: 'LicenseRef-Private-Prototype-Art',
      permission: { status: 'local-prototype-only', webPublication: false, sourceRedistribution: false, macAppBundling: false },
      modifications: [{ date: '2026-11-10', description: descriptions[path][3] }],
      sha256: createHash('sha256').update(data).digest('hex'),
    })),
  };
  files.set('assets/manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  return files;
}

async function main() {
  const check = process.argv.includes('--check');
  const files = generateAssets();
  for (const [path, data] of files) {
    const target = resolve(root, path);
    if (check) {
      const existing = await readFile(target);
      if (!existing.equals(data)) throw new Error(`${path} differs from its editable source. Run assets:generate after reviewing changes.`);
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    }
  }
  console.log(`${check ? 'Verified' : 'Generated'} ${files.size} reproducible asset files. No third-party artwork included.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
