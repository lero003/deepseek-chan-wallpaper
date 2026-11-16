import { build } from 'vite';
import { mkdir, readFile, writeFile, copyFile, realpath, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { crc32, inflateSync } from 'node:zlib';
import { SUNSET_LAYOUT, PLACEHOLDER_LAYOUT } from '../src/art/scene-profiles.ts';
import { createWorld, advanceWorld, seedFromText } from '../src/world/world.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { parseLifeAtlas } from '../src/render/life-art.ts';
import { motesFor, scenePlan } from '../src/render/scene-plan.ts';
import { createGame, advanceGame } from '../src/fighters/game.ts';
import { STAGE_WIDTH } from '../src/fighters/definitions.ts';
import { parseBossAtlas } from '../src/fighters/render-types.ts';
import { parsePoseAtlas } from '../src/fighters/pose-art.ts';
import { combatArtFixtures } from './combat-art-fixtures.mjs';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Validate optional PNGs before selecting them for packaging, without a native tool
// or extra image dependency. ImageIO still independently decodes them at app startup.
function validateLifePNG(png, atlas) {
  const invalid = () => { throw new Error('Life PNG data or dimensions do not match its atlas.'); };
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) invalid();
  let offset = 8, header, ended = false, paletteEntries = 0;
  const compressed = [];
  while (offset < png.length) {
    if (offset + 12 > png.length) invalid();
    const length = png.readUInt32BE(offset), end = offset + length + 12;
    if (end > png.length) invalid();
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, end - 4);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) invalid();
    if (offset === 8 && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (header || length !== 13) invalid();
      header = data;
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'PLTE') {
      if (paletteEntries || length === 0 || length > 768 || length % 3 !== 0) invalid();
      paletteEntries = length / 3;
    } else if (type === 'IEND') {
      if (length !== 0 || end !== png.length) invalid();
      ended = true;
    } else if (type[0] === type[0].toUpperCase()) invalid();
    offset = end;
  }
  if (!header || !ended || compressed.length === 0) invalid();
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), depth = header[8], color = header[9];
  const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (width !== atlas.frameWidth * atlas.columns || height !== atlas.frameHeight * atlas.rows
    || !depths[color]?.includes(depth) || header[10] !== 0 || header[11] !== 0 || header[12] > 1
    || (color === 3 && (paletteEntries === 0 || paletteEntries > 2 ** depth))) invalid();
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const passes = header[12] === 0 ? [[0, 0, 1, 1]]
    : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  const rows = passes.flatMap(([x, y, dx, dy]) => {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
    return w > 0 ? Array(h).fill(Math.ceil(w * channels * depth / 8) + 1) : [];
  });
  const expected = rows.reduce((sum, count) => sum + count, 0);
  const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  if (pixels.length !== expected) invalid();
  let cursor = 0;
  for (const count of rows) { if (pixels[cursor] > 4) invalid(); cursor += count; }
}

export async function prepareMacResources({ localPreview = false, output } = {}) {
  const root = await realpath(projectRoot);
  const dest = resolve(output ?? resolve(root, 'private-art/macos-work/Resources'));
  if (!dest.startsWith(resolve(root, 'private-art') + sep)) throw new Error('Build output must remain inside ignored private-art.');
  await mkdir(dest, { recursive: true });
  if (await realpath(dest) !== dest || (await lstat(dest)).isSymbolicLink()) throw new Error('Refuse symlinked output.');
  const source = resolve(root, localPreview ? 'private-art/runtime' : 'assets');
  if (localPreview && !existsSync(resolve(source, 'manifest.json'))) throw new Error('Local production art is missing. Use the placeholder profile or prepare authorized local art first.');
  let layout = localPreview ? SUNSET_LAYOUT : PLACEHOLDER_LAYOUT;
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  const atlas = parseAtlas(JSON.parse(await readFile(resolve(source, 'character/atlas.json'), 'utf8')));
  const paths = ['character/sheet.png', 'character/atlas.json', 'scene/seaside-room.png'];
  // The optional wide wallpaper matte is bundled only for the local production profile.
  if (layout.matte) paths.push('scene/seaside-room-matte.png');
  // Optional selectable backgrounds (night/rain/dawn/snow) are listed in the ignored local runtime.
  const variants = [];
  const variantsPath = resolve(source, 'variants.json');
  if (localPreview && layout.matte && existsSync(variantsPath)) {
    const data = JSON.parse(await readFile(variantsPath, 'utf8'));
    if (data.schemaVersion !== 1 || !Array.isArray(data.variants)) throw new Error('variants.json is malformed.');
    const seen = new Set();
    for (const item of data.variants) {
      const safeRelative = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..');
      if (typeof item.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id) || seen.has(item.id)) throw new Error(`Invalid background variant id: ${item.id}`);
      if (typeof item.label !== 'string' || item.label.length === 0) throw new Error(`Invalid background variant label: ${item.id}`);
      if (!safeRelative(item.scene) || !safeRelative(item.matte)) throw new Error(`Unsafe background variant path: ${item.id}`);
      seen.add(item.id);
      const variant = { id: item.id, label: item.label, scene: item.scene, matte: item.matte };
      if (item.appearance !== undefined) {
        const mood = item.appearance?.ambience?.mood;
        if (mood !== undefined && !['sunset', 'night', 'rain'].includes(mood)) throw new Error(`Invalid ambient mood for variant: ${item.id}`);
        variant.appearance = item.appearance;
      }
      variants.push(variant);
      paths.push(item.scene, item.matte);
    }
  }
  // Additional quiet-life art is independent from the approved sixteen frames. Only
  // an explicitly authorized local preview may select it, after both files validate.
  let life;
  const lifePaths = { sheet: 'character/life/sheet.png', atlas: 'character/life/atlas.json' };
  if (localPreview && Object.values(lifePaths).every(name => existsSync(resolve(source, name)))) {
    try {
      const buffers = {};
      for (const name of Object.values(lifePaths)) {
        const input = resolve(source, name);
        if (await realpath(input) !== input || !(await lstat(input)).isFile()) throw new Error(`Refuse linked or non-file life asset: ${name}`);
        const bytes = await readFile(input);
        const records = manifest.assets.filter(asset => asset.path === name);
        if (records.length !== 1 || records[0].sha256 !== hash(bytes)
          || typeof records[0].author !== 'string' || !records[0].author.trim()
          || typeof records[0].license !== 'string' || !records[0].license.trim()) throw new Error(`Life asset provenance mismatch: ${name}`);
        buffers[name] = bytes;
      }
      const lifeAtlas = parseLifeAtlas(JSON.parse(buffers[lifePaths.atlas].toString('utf8')));
      validateLifePNG(buffers[lifePaths.sheet], lifeAtlas);
      life = lifePaths;
      layout = { ...layout, lifeAtlas };
      paths.push(life.sheet, life.atlas);
    } catch (error) {
      console.warn('[kujira] Optional life sheet unavailable; keeping approved sixteen frames.', error.message);
    }
  }
  // Rival art is an optional ignored enhancement, only in explicit local-preview mode.
  // Each rival has its own optional sheet/atlas: one missing or invalid rival must not
  // remove the others, and the committed placeholder never imports or bundles private files.
  const rivalCandidates = {
    lumie: { sheet: 'fighters/lumie/sheet.png', atlas: 'fighters/lumie/atlas.json' },
    shio: { sheet: 'fighters/shio/sheet.png', atlas: 'fighters/shio/atlas.json' },
    yume: { sheet: 'fighters/yume/sheet.png', atlas: 'fighters/yume/atlas.json' },
  };
  const bosses = {};
  const bossAtlases = {};
  if (localPreview) {
    for (const [id, candidate] of Object.entries(rivalCandidates)) {
      if (!Object.values(candidate).every(name => existsSync(resolve(source, name)))) continue;
      try {
        for (const name of Object.values(candidate)) {
          const input = resolve(source, name);
          if (await realpath(input) !== input || !(await lstat(input)).isFile()) throw new Error(`Refuse linked or non-file rival asset: ${name}`);
        }
        bossAtlases[id] = parseBossAtlas(JSON.parse(await readFile(resolve(source, candidate.atlas), 'utf8')));
        bosses[id] = candidate;
        paths.push(candidate.sheet, candidate.atlas);
      } catch (error) {
        console.warn(`[kujira] Optional rival ${id} unavailable; keeping its code fallback.`, error.message);
      }
    }
  }
  if (Object.keys(bosses).length > 0) {
    layout = { ...layout, ...(bossAtlases.lumie ? { bossAtlas: bossAtlases.lumie } : {}), bossAtlases,
      provenance: `${layout.provenance} 綴星リュミエ・汐見のリツカ・紙灯のユメはいずれもGPT Imageで新規制作した非公式オリジナルライバルで、公式キャラクター・第三者素材ではありません。8姿勢シートはローカル専用で、公開・再配布・Mac同梱の許諾はpending、専用戦闘アニメーションの自然さは未確認です。` };
  }
  const boss = bosses.lumie;
  // Optional painted terrace backdrop for the fixed manual arena (local-preview only).
  // Absent in the committed placeholder; a missing file simply keeps the code-drawn stage.
  let arena;
  const arenaScene = 'scene/arena/terrace.png';
  if (localPreview && existsSync(resolve(source, arenaScene))) {
    const input = resolve(source, arenaScene);
    if (await realpath(input) !== input || !(await lstat(input)).isFile()) throw new Error(`Refuse linked or non-file arena asset: ${arenaScene}`);
    arena = { scene: arenaScene };
    paths.push(arenaScene);
  }
  const sprites = {};
  for (const [key, directory] of [['combat', 'character/combat'], ['slime', 'fighters/slime'], ['popup', 'fighters/popup']]) {
    const candidate = { sheet: `${directory}/sheet.png`, atlas: `${directory}/atlas.json` };
    if (!localPreview || !Object.values(candidate).every(name => existsSync(resolve(source, name)))) continue;
    for (const name of Object.values(candidate)) {
      const input = resolve(source, name);
      if (await realpath(input) !== input || !(await lstat(input)).isFile()) throw new Error(`Refuse linked optional combat asset: ${name}`);
    }
    let atlas;
    try { atlas = parsePoseAtlas(JSON.parse(await readFile(resolve(source, candidate.atlas), 'utf8')), key); }
    catch { console.warn(`[kujira] Optional ${key} atlas invalid; keeping original drawing.`); continue; }
    layout = { ...layout, [`${key}Atlas`]: atlas };
    sprites[key] = candidate;
    paths.push(candidate.sheet, candidate.atlas);
  }
  if (Object.keys(sprites).length) layout = { ...layout,
    provenance: `${layout.provenance} 主人公戦闘8キー姿勢と既存雑魚2種の6姿勢×3バリエーションは、GPT Image生成・二値透過・足元整列・共有80色による別シートです。手動アリーナ専用で、生活16コマ・背景${variants.length + 1}種・各マットは不変。途中のデザイン確認はユーザーが省略して制作統合を委任しましたが、公開再配布の権利確認や連続動作・実機操作の受け入れではありません。` };
  const assets = [];
  for (const name of paths) {
    const input = resolve(source, name);
    if (await realpath(input) !== input || !(await lstat(input)).isFile()) throw new Error(`Refuse linked or non-file asset: ${name}`);
    const bytes = await readFile(input);
    const ledgerPath = localPreview ? name : `assets/${name}`;
    const records = manifest.assets.filter(asset => asset.path === ledgerPath);
    if (records.length !== 1 || records[0].sha256 !== hash(bytes)) throw new Error(`Asset provenance mismatch: ${name}`);
    const target = resolve(dest, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(input, target);
    assets.push(localPreview ? records[0] : { ...records[0], path: name, sourcePath: ledgerPath });
  }
  const result = await build({ configFile: false, root, envDir: false, publicDir: false, logLevel: 'warn', build: {
    write: false, minify: false, target: 'es2022', sourcemap: false,
    lib: { entry: resolve(root, 'src/app-mac/native-bridge.ts'), name: 'KujiraNative', formats: ['iife'] },
  } });
  const bundle = Array.isArray(result) ? result[0] : result;
  const chunk = bundle.output.find(item => item.type === 'chunk');
  if (!chunk) throw new Error('The shared native core was not built.');
  const core = Buffer.from(chunk.code);
  await writeFile(resolve(dest, 'world.js'), core);
  const configuration = { schemaVersion: 1, localPreviewOnly: true, coreSha256: hash(core), atlas, layout, stage: { width: STAGE_WIDTH },
    ...(variants.length > 0 ? { variants } : {}), ...(boss ? { boss } : {}),
    ...(Object.keys(bosses).length > 0 ? { bosses } : {}), ...(life ? { life } : {}),
    ...(arena ? { arena } : {}), ...(Object.keys(sprites).length ? { sprites } : {}) };
  await writeFile(resolve(dest, 'configuration.json'), JSON.stringify(configuration, null, 2) + '\n');
  await writeFile(resolve(dest, 'manifest.json'), JSON.stringify({ ...manifest, assets,
    localAppPreview: { userAuthorized: localPreview, publicationAuthorized: false, thirdPartyRightsVerified: false },
    note: `${manifest.note} 個人用ローカルアプリの検証用。公開・第三者配布・一般的なMac同梱許諾を確認した意味ではありません。` }, null, 2) + '\n');
  for (const name of ['CREDITS.md', 'ART-LICENSE.md']) await copyFile(resolve(root, name), resolve(dest, name));
  const fixtureAtlas = parseAtlas(atlas);
  const fixture = { seed: 'seaside-v01', initial: null, replays: [], gameReplays: [],
    artPlans: combatArtFixtures(fixtureAtlas, layout, arena != null) };
  const initial = createWorld(seedFromText(fixture.seed), layout.scene);
  fixture.initial = scenePlan(initial, fixtureAtlas, motesFor(initial.seed), layout, true);
  for (const fps of [15, 30, 60]) {
    const world = createWorld(seedFromText(fixture.seed), layout.scene);
    for (let index = 0; index < 1800 * fps; index++) advanceWorld(world, 1 / fps);
    fixture.replays.push({ fps, seconds: 1800, world });
    const game = createGame(seedFromText(fixture.seed), layout.scene);
    for (let index = 0; index < 1800 * fps; index++) advanceGame(game, 1 / fps);
    fixture.gameReplays.push({ fps, seconds: 1800, game });
  }
  await writeFile(resolve(dest, 'test-fixtures.json'), JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Prepared ${layout.kind} macOS resources with the shared TypeScript core.`);
  return { root, resources: dest, layout, configuration, variants };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const localPreview = process.argv.includes('--local-preview');
  await prepareMacResources({ localPreview });
}
