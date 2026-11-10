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
  const layout = localPreview ? SUNSET_LAYOUT : PLACEHOLDER_LAYOUT;
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  const atlas = parseAtlas(JSON.parse(await readFile(resolve(source, 'character/atlas.json'), 'utf8')));
  const paths = ['character/sheet.png', 'character/atlas.json', 'scene/seaside-room.png'];
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
  const configuration = { schemaVersion: 1, localPreviewOnly: true, coreSha256: hash(core), atlas, layout, stage: { width: STAGE_WIDTH } };
  await writeFile(resolve(dest, 'configuration.json'), JSON.stringify(configuration, null, 2) + '\n');
  await writeFile(resolve(dest, 'manifest.json'), JSON.stringify({ ...manifest, assets,
    localAppPreview: { userAuthorized: localPreview, publicationAuthorized: false, thirdPartyRightsVerified: false },
    note: `${manifest.note} 個人用ローカルアプリの検証用。公開・第三者配布・一般的なMac同梱許諾を確認した意味ではありません。` }, null, 2) + '\n');
  for (const name of ['CREDITS.md', 'ART-LICENSE.md']) await copyFile(resolve(root, name), resolve(dest, name));
  const fixtureAtlas = parseAtlas(atlas);
  const fixture = { seed: 'seaside-v01', initial: null, replays: [], gameReplays: [] };
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
  return { root, resources: dest, layout, configuration };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const localPreview = process.argv.includes('--local-preview');
  await prepareMacResources({ localPreview });
}
