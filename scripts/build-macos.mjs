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
  ...(prepared.layout.matte ? ['scene/seaside-room-matte.png'] : []), 'CREDITS.md', 'ART-LICENSE.md']) {
  const destination = resolve(resources, name);
  assert.ok(destination.startsWith(resources + sep));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(prepared.resources, name), destination);
}
await writeFile(resolve(resources, 'FIGHTERS-README.txt'), `くじらの散歩道 — DeepSeekちゃんファイターズ MVP\n\n初回はプレビューのみ。壁紙は「壁紙にする」で明示的にONにします。\n普段は静かな書斎。小事件は既定で帰還後3〜5分の待ち時間。自動の小事件は書斎の中で起き、カメラは動きません。「事件を見る」で今すぐ確認できます。\n「遊ぶ」で手動。WASD／矢印で移動、J/Zで3段攻撃、K/Xで回避、L/Cでゲージ100の必殺技、Escでゲームポーズ。\n「壁紙へ戻る」でオートへ。「もう一度遊ぶ」で再挑戦。手動入力は前面プレビューだけ。\n壁紙は全モードでクリック透過。手動ゲーム中の壁紙は静かな生活を表示します。\n元の壁紙設定は変更しません。停止・終了はメニューバーから。ログイン自動起動は登録しません。\n少なめ／通常／事件なし、控えめエフェクト、省電力をメニューから選べます。音は常時無音です。\nOS Reduce Motionでは既存方針どおり静止。遊ぶにはその設定を人の判断でご確認ください。\n\nApple Silicon用・個人用のローカル試作、アドホック署名・未公証です。公開・第三者配布は未許諾。\n敵・技・左右背景は仮のピクセル図形。主人公の専用戦闘コマ、音、手動の操作感は後続調整。\n自動テスト／単体起動／ネイティブ描画器の検証は、可視キー操作・壁紙ON/OFF・Space・スリープ・実時間30分負荷の合格ではありません。\n旧版が起動中なら終了してからこの版を開いてください。\n`);
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
<key>CFBundleVersion</key><string>6</string>
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
run(executable, ['--render-preview', resolve(output, 'native-preview.png'), '--time', '6']);
run(executable, ['--render-preview', resolve(output, 'native-preview-wide.png'), '--time', '6', '--width', '2048', '--height', '864']);
run(executable, ['--render-room-event', resolve(output, 'native-room-event.png'), '--time', '3']);
run(executable, ['--render-room-event', resolve(output, 'native-room-event-wide.png'), '--time', '3', '--width', '2048', '--height', '864']);
run(executable, ['--render-manual', resolve(output, 'native-manual.png'), '--time', '45']);
run(executable, ['--render-manual', resolve(output, 'native-boss.png'), '--capture-boss', '--time', '180']);
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
const zip = resolve(output, `KujiraWallpaper-Wallpaper-Brushup-${architecture.replaceAll(' ', '-')}-local-preview.zip`);
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
  gameplay: 'wallpaper-brushup-v0.5-room-incidents', bundleBuild: '6',
  gamePreviews: [relative(root, resolve(output, 'native-room-event.png')), relative(root, resolve(output, 'native-room-event-wide.png')), relative(root, resolve(output, 'native-manual.png')), relative(root, resolve(output, 'native-boss.png'))],
  autoStartEnabled: false, desktopAcceptance: 'manual-not-run', systemLibraries, files };
await writeFile(resolve(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(privateRoot, 'macos-out/latest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`APP_READY: ${report.app}`);
console.log(`ZIP_READY: ${report.zip}`);
console.log(`ZIP_SHA256: ${report.zipSha256}`);
console.log('Personal local preview only. Ad-hoc signed, NOT Apple notarized. System wallpaper/login settings unchanged.');
