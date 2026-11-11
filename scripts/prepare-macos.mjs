import { build } from 'vite';
import { mkdir, readFile, writeFile, copyFile, realpath, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SUNSET_LAYOUT, PLACEHOLDER_LAYOUT } from '../src/art/scene-profiles.ts';
import { createWorld, advanceWorld, seedFromText } from '../src/world/world.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { motesFor, scenePlan } from '../src/render/scene-plan.ts';
import { createGame, advanceGame } from '../src/fighters/game.ts';
import { STAGE_WIDTH } from '../src/fighters/definitions.ts';
import { parseBossAtlas } from '../src/fighters/render-types.ts';
import { parsePoseAtlas } from '../src/fighters/pose-art.ts';
import { combatArtFixtures } from './combat-art-fixtures.mjs';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

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
  // Optional selectable backgrounds (night/rain) are listed in the ignored local runtime.
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
  // Rival art is an optional ignored enhancement, only in explicit local-preview mode.
  // The committed placeholder never imports or bundles private files.
  let boss;
  const bossPaths = { sheet: 'fighters/lumie/sheet.png', atlas: 'fighters/lumie/atlas.json' };
  if (localPreview && Object.values(bossPaths).every(name => existsSync(resolve(source, name)))) {
    for (const name of Object.values(bossPaths)) {
      const input = resolve(source, name);
      if (await realpath(input) !== input || !(await lstat(input)).isFile()) throw new Error(`Refuse linked or non-file rival asset: ${name}`);
    }
    const bossAtlas = parseBossAtlas(JSON.parse(await readFile(resolve(source, bossPaths.atlas), 'utf8')));
    boss = bossPaths;
    layout = { ...layout, bossAtlas,
      provenance: `${layout.provenance} 綴星リュミエは文章・思考を着想にGPT Imageで新規制作した非公式オリジナルライバル。Claude／Anthropicの公式キャラクター・提携作品ではありません。公式ロゴ・第三者素材なし。8姿勢はローカル専用で、専用戦闘アニメーションの自然さは未確認です。` };
    paths.push(boss.sheet, boss.atlas);
  }
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
    provenance: `${layout.provenance} 主人公戦闘8キー姿勢と既存雑魚2種の6姿勢×3バリエーションは、GPT Image生成・二値透過・足元整列・共有80色による別シートです。手動アリーナ専用で、生活16コマ・背景3種・各マットは不変。途中のデザイン確認はユーザーが省略して制作統合を委任しましたが、公開再配布の権利確認や連続動作・実機操作の受け入れではありません。` };
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
    ...(variants.length > 0 ? { variants } : {}), ...(boss ? { boss } : {}), ...(arena ? { arena } : {}), ...(Object.keys(sprites).length ? { sprites } : {}) };
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
