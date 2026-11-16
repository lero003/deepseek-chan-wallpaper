import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, copyFile, chmod, readFile, writeFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareMacResources, projectRoot, hash } from './prepare-macos.mjs';
import { systemLibraryPaths } from './macos-dependencies.mjs';
import { appDirectoryName } from './macos-archive.mjs';

if (process.platform !== 'darwin') throw new Error('Build this private app on macOS with an existing Swift 6.2+ toolchain.');
const flags = process.argv.slice(2);
if (flags.some(flag => !['--local-preview', '--placeholder'].includes(flag)) || (flags.includes('--local-preview') && flags.includes('--placeholder'))) {
  throw new Error('Use --local-preview for the authorized local art, or --placeholder for the fallback. No publishing mode exists.');
}
const localPreview = flags.includes('--local-preview');
const root = await realpath(projectRoot);
const privateRoot = resolve(root, 'private-art');
await mkdir(privateRoot, { recursive: true });
assert.equal(await realpath(privateRoot), privateRoot, 'Refuse a symlinked private output root.');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
  return result;
};
const capture = (command, args) => {
  const result = run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return result.stdout.trim();
};
run('npm', ['run', 'check']);
const prepared = await prepareMacResources({ localPreview });
run('swift', ['test', '--disable-sandbox', '--scratch-path', resolve(privateRoot, 'swift-build')], { env: { ...process.env, KUJIRA_TEST_RESOURCES: prepared.resources } });
const scratch = resolve(privateRoot, 'swift-release');
run('swift', ['build', '-c', 'release', '--disable-sandbox', '--product', 'KujiraWallpaper', '--scratch-path', scratch]);
const binDir = capture('swift', ['build', '-c', 'release', '--disable-sandbox', '--show-bin-path', '--scratch-path', scratch]).split('\n').at(-1);
const sourceBinary = resolve(binDir, 'KujiraWallpaper');
assert.ok(sourceBinary.startsWith(privateRoot + sep));
assert.equal(await realpath(sourceBinary), sourceBinary);
assert.equal((await lstat(sourceBinary)).isFile(), true);
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 8);
const output = resolve(privateRoot, 'macos-out', stamp);
await mkdir(output, { recursive: true });
assert.equal(await realpath(output), output);
const app = resolve(output, 'くじらの散歩道.app');
const contents = resolve(app, 'Contents');
const resources = resolve(contents, 'Resources');
const macos = resolve(contents, 'MacOS');
await mkdir(macos, { recursive: true });
await mkdir(resources, { recursive: true });
for (const name of ['world.js', 'configuration.json', 'manifest.json', 'character/sheet.png', 'character/atlas.json', 'scene/seaside-room.png',
  ...(prepared.layout.matte ? ['scene/seaside-room-matte.png'] : []),
  ...(prepared.configuration.variants ?? []).flatMap(variant => [variant.scene, variant.matte]),
  ...(prepared.configuration.bosses ? Object.values(prepared.configuration.bosses).flatMap(boss => [boss.sheet, boss.atlas]) : []),
  ...(prepared.configuration.life ? [prepared.configuration.life.sheet, prepared.configuration.life.atlas] : []),
  ...(prepared.configuration.arena ? [prepared.configuration.arena.scene] : []),
  ...Object.values(prepared.configuration.sprites ?? {}).flatMap(sprite => [sprite.sheet, sprite.atlas]),
  'CREDITS.md', 'ART-LICENSE.md']) {
  const destination = resolve(resources, name);
  assert.ok(destination.startsWith(resources + sep));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(prepared.resources, name), destination);
}
await writeFile(resolve(resources, 'README.txt'), `くじらの散歩道 — Build 19

海辺の書斎と、勝ち負けのないリュミエとの対戦を眺めるドット絵の壁紙アプリです。

・初回はプレビューのみ。「壁紙にする」で明示的にONにします。
・モードは「書斎で過ごす」「リュミエとゆっくり対戦」「手動で3連戦」。
・ゆっくり対戦はリュミエのみ。近づく→打ち合う→後ろ跳び・後ろ歩き・背を向けて離れる→一呼吸を繰り返します。HP表示・スコア・勝敗はなく、自動で続きます。
・手動対戦は壁紙OFF時だけ。画面をクリックし、矢印/WASDで移動、Jで攻撃、Kで回避、Lで必殺技、Escで一時停止。
・手動対戦中に壁紙ONにすると、選んでいた書斎／ゆっくり対戦へ戻ります。
・敗北・TIME UP時は「再挑戦」、いつでも「書斎へ戻る」で終了できます。
・背景・書斎／ゆっくり対戦・一時停止・省電力の設定は保存されます。手動対戦の進行は保存しません。
・壁紙は全ディスプレイへ同期表示するクリック透過のパネルです。元の壁紙設定を変更しません。
・OSの「視差効果を減らす」、スリープ・非表示・メニュー表示中は停止します。
・通信・音声・通知・分析・ログイン自動起動はありません。

非公式ファン作品。キャラクター原案・デザインはファンコミュニティと原案者に帰属します。DeepSeek社との提携・承認はありません。
Apple Silicon用・個人用ローカル試作。アドホック署名・未公証。Macアプリの公開・第三者配布は未許諾。素材の再配布ライセンスは付与していません。
`);

const executable = resolve(macos, 'KujiraWallpaper');
await copyFile(sourceBinary, executable); await chmod(executable, 0o755);
run('/usr/bin/strip', ['-S', executable]);
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await writeFile(resolve(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>KujiraWallpaper</string>
<key>CFBundleIdentifier</key><string>local.kujira.walkway</string>
<key>CFBundleName</key><string>くじらの散歩道</string>
<key>CFBundleDisplayName</key><string>くじらの散歩道（個人用試作）</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${xml(version)}</string>
<key>CFBundleVersion</key><string>19</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><false/>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSHumanReadableCopyright</key><string>非公式ファン作品・個人用ローカル試作。公開・再配布許諾未確認。</string>
</dict></plist>\n`);
await writeFile(resolve(contents, 'PkgInfo'), 'APPL????');
// strip can invalidate the linker's ad-hoc signature. Sign before executing the icon tool.
const signing = ['--force', '--sign', '-', '--options', 'runtime', '--timestamp=none', '--entitlements', resolve(root, 'src/app-mac/Entitlements.plist')];
run('/usr/bin/codesign', [...signing, app]);
const iconset = resolve(output, 'AppIcon.iconset');
run(executable, ['--resources', resources, '--make-icons', iconset]);
const icon = resolve(resources, 'AppIcon.icns');
run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', icon]);
const manifestPath = resolve(resources, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.assets.push({ id: 'A04-mac', path: 'AppIcon.icns', name: 'Mac用の個人試作アイコン', dimensions: '16–1024px / ICNS',
  author: `本プロジェクト内で${localPreview ? '承認済み' : '初期仮'}スプライトと独自タイルからCoreGraphics生成`, source: 'src/app-mac/Core/ScenePainter.swift', sourceUrl: null,
  license: 'LicenseRef-Private-Prototype-Art', sha256: hash(await readFile(icon)),
  permission: { status: 'unverified-local-app-preview-only', webPublication: false, sourceRedistribution: false, macAppBundling: false },
  modifications: [{ description: '選択プロファイルの待機フレームを使い、独自の角丸タイルと波を合成。' }] });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
run('/usr/bin/plutil', ['-lint', resolve(contents, 'Info.plist')]);
run('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', '--timestamp=none', '--entitlements', resolve(root, 'src/app-mac/Entitlements.plist'), app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
run(executable, ['--self-test']);
run(executable, ['--fighters-self-test']);
// Startup smoke: preview + menus create, preview close releases its window/view, reopen works.
// Wallpaper stays OFF; this is not visible-desktop acceptance.
const smokeOutput = capture(executable, ['--smoke-test']);
assert.ok(smokeOutput.includes('NATIVE_STARTUP_PASS'), `Startup smoke failed: ${smokeOutput}`);
assert.ok(smokeOutput.includes('"previewCloseReopenVerified":true'), 'Preview close/reopen cleanup was not verified.');
assert.ok(smokeOutput.includes('"modeControlCreated":true'), 'The mode selector must be present.');
run(executable, ['--render-preview', resolve(output, 'native-preview.png'), '--time', '6']);
run(executable, ['--render-preview', resolve(output, 'native-preview-wide.png'), '--time', '6', '--width', '2048', '--height', '864']);
for (const variant of prepared.configuration.variants ?? []) {
  run(executable, ['--render-preview', resolve(output, `native-preview-${variant.id}-wide.png`), '--variant', variant.id,
    '--time', '6', '--width', '2048', '--height', '864']);
}
run(executable, ['--render-room-event', resolve(output, 'native-room-event.png'), '--time', '3']);
run(executable, ['--render-room-event', resolve(output, 'native-room-event-wide.png'), '--time', '3', '--width', '2048', '--height', '864']);
if ((prepared.configuration.variants ?? []).some(variant => variant.id === 'night')) {
  run(executable, ['--render-room-event', resolve(output, 'native-room-event-night-wide.png'), '--variant', 'night', '--time', '3', '--width', '2048', '--height', '864']);
}
run(executable, ['--render-sparring', resolve(output, 'native-sparring-wide.png'), '--time', '12', '--width', '2048', '--height', '864']);
run(executable, ['--render-manual', resolve(output, 'native-manual.png'), '--time', '5']);
run(executable, ['--render-manual', resolve(output, 'native-boss.png'), '--capture-boss', '--time', '180']);
const phasePreviews = ['intro', 'roundClear', 'bossIntro', 'victory', 'result'];
for (const phase of phasePreviews) {
  run(executable, ['--render-manual', resolve(output, `native-arena-${phase}.png`), '--capture-phase', phase, '--time', '180']);
}
const files = [];
async function enumerate(directory, base = app, collection = files) {
  for (const name of await readdir(directory)) {
    const path = resolve(directory, name);
    const info = await lstat(path);
    assert.equal(info.isSymbolicLink(), false, 'No linked external resources in the app.');
    if (info.isDirectory()) await enumerate(path, base, collection);
    else collection.push({ path: relative(base, path), bytes: info.size, sha256: hash(await readFile(path)) });
  }
}
await enumerate(app);
assert.ok(files.every(file => !/(^|\/)(node_modules|production|concepts|research|\.env)(\/|$)/.test(file.path)));
const architecture = capture('/usr/bin/lipo', ['-archs', executable]);
const libraries = capture('/usr/bin/otool', ['-L', executable]);
const systemLibraries = systemLibraryPaths(libraries);
const zip = resolve(output, `KujiraWallpaper-Sparring-B19-${architecture.replaceAll(' ', '-')}-local-preview.zip`);
run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
// Legacy unzip console output can corrupt Japanese names under C locales.
// Validate the real archive more strictly: extract, compare every byte, verify and execute.
const unpacked = resolve(output, 'archive-verification');
run('/usr/bin/ditto', ['-x', '-k', zip, unpacked]);
const restoredApp = resolve(unpacked, appDirectoryName(await readdir(unpacked)));
const restoredFiles = [];
await enumerate(restoredApp, restoredApp, restoredFiles);
const byPath = (a, b) => a.path.localeCompare(b.path);
assert.deepEqual(restoredFiles.sort(byPath), [...files].sort(byPath), 'Every archived file must retain its name, size, and SHA-256.');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', restoredApp]);
run(resolve(restoredApp, 'Contents/MacOS/KujiraWallpaper'), ['--self-test'], {
  cwd: unpacked, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' },
});
run(resolve(restoredApp, 'Contents/MacOS/KujiraWallpaper'), ['--fighters-self-test'], {
  cwd: unpacked, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' },
});
const report = { schemaVersion: 1, app: relative(root, app), zip: relative(root, zip), zipSha256: hash(await readFile(zip)),
  preview: relative(root, resolve(output, 'native-preview.png')), architecture, minimumMacOS: '14.0', testedMacOS: 'current-build-machine-only',
  profile: prepared.layout.id, version, signing: 'ad-hoc hardened runtime, bundled-code JIT entitlement only', notarized: false,
  localPreviewOnly: true, published: false, thirdPartyRightsVerified: false, originalWallpaperChangedDuringBuild: false,
  archiveVerified: true, relocatedStandaloneSelfTest: true, relocatedFightersSelfTest: true,
  gameplay: 'quiet-life + no-result Lumie sparring + manual arena only with wallpaper OFF + multi-display', bundleBuild: '19',
  startupSmoke: 'preview-create-close-reopen verified; wallpaper stayed OFF',
  bundledLifeGestures: prepared.configuration.life ? ['hop', 'giggle', 'sway', 'peek', 'stretch', 'daydream'] : [],
  bundledCombatSheets: Object.keys(prepared.configuration.sprites ?? {}),
  gamePreviews: ['native-room-event.png', 'native-room-event-wide.png',
     ...((prepared.configuration.variants ?? []).some(variant => variant.id === 'night') ? ['native-room-event-night-wide.png'] : []),
     'native-sparring-wide.png', 'native-manual.png', 'native-boss.png', ...phasePreviews.map(phase => `native-arena-${phase}.png`)].map(name => relative(root, resolve(output, name))),
  backgroundVariants: (prepared.configuration.variants ?? []).map(variant => variant.id),
  backgroundPreviews: (prepared.configuration.variants ?? []).map(variant => relative(root, resolve(output, `native-preview-${variant.id}-wide.png`))),
  autoStartEnabled: false, desktopAcceptance: 'manual-not-run', systemLibraries, files };
await writeFile(resolve(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(privateRoot, 'macos-out/latest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`APP_READY: ${report.app}`);
console.log(`ZIP_READY: ${report.zip}`);
console.log(`ZIP_SHA256: ${report.zipSha256}`);
console.log('Personal local preview only. Ad-hoc signed, NOT Apple notarized. System wallpaper/login settings unchanged.');
