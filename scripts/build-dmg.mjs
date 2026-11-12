import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, symlink, rm, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './prepare-macos.mjs';
import { appDirectoryName } from './macos-archive.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
  return result;
};
const capture = (command, args, options = {}) => run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options }).stdout.trim();

export function dmgFileName(architecture) {
  return `KujiraWallpaper-Brushup-B11-${architecture}.dmg`;
}

export function releaseReadme({ version, zipSha256, architecture }) {
  return `くじらの散歩道 — アプリ・ブラッシュアップ Build 11（個人テスト用）
==================================================================

これは個人検証用の非公開リリースです。公開配布物・正式リリースではありません。
素材の権利・公開許諾は未確認のため、再配布・公開アップロードをしないでください。

対応環境
- Apple Silicon（arm64） / macOS 14 以降
- アドホック署名のみで、Appleの公証は受けていません。
- 初回はアプリを右クリック →「開く」で起動してください。macOSの保護設定を
  全体で無効にする必要はありません。個別に許可する場合は「システム設定 >
  プライバシーとセキュリティ」からどうぞ。

使い方
1. 「くじらの散歩道.app」を Applications へドラッグ（任意）。
2. 起動するとプレビューが開きます。壁紙は「壁紙にする」を選んだときだけ表示。
3. 元の壁紙設定は変更しません。OFF・終了でアプリのウィンドウが消えます。
4. シーン下の「背景」で夕凪・月夜・雨音を切り替え（「雨音」は景色で音は鳴りません）。
   「呼んでみる」で、書斎で休んでいるDeepSeekちゃんが小さく応えます。
5. 手動操作: WASD／矢印で移動、J/Zで3段コンボ、K/Xで回避、L/Cで必殺、
   Escでポーズ。メニューバーから「書斎へ戻る」「もう一度遊ぶ」。
6. 音は常時無音。通信・解析・ログイン自動起動はありません。

今回の変更（Build 11）
- 戦闘の背景は16:9以外の画面でも端を引き伸ばさず、濃い単色の額で囲む
  （手動アリーナ・壁紙の自動対戦とも。背景の原寸と拡大率は従来どおり）

Build 10までの主な内容
- 「おっとり。ときどき、つよい。」のタグラインと、分かりやすい背景選択
- プレビュー限定の「呼んでみる」（20秒に1回・書斎で休んでいる時だけ）
- 生活・帰宅の小さなキャプション、About に正面の小さな姿
- ゲームの帰宅は「書斎へ戻る」。壁紙ON/OFFとは別操作

検証済み
- 署名検証、DMGからの単体起動、同梱素材のハッシュ、自己テスト
- Node 202テスト、Swift 27テスト（両プロファイル）、Webビルド（通常・placeholder）
未確認
- 実画面でのキー操作の感触、壁紙ON/OFF、Space、スリープ復帰
- 実時間30分のCPU・メモリ・発熱、別のMac／OS、Gatekeeperの挙動
- 「呼んでみる」の実際の見え方・テンポ

記録
- アプリ版: ${version}
- 元ZIP SHA-256: ${zipSha256}
- DMGのSHA-256はリリースの SHA256SUMS.txt を参照してください。
- このDMGには個人用の生成素材が含まれます。権利確認前の共有は避けてください。
`;
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Build the private release DMG on macOS.');
  const root = await realpath(projectRoot);
  const privateRoot = resolve(root, 'private-art');
  await mkdir(privateRoot, { recursive: true });
  assert.equal(await realpath(privateRoot), privateRoot, 'Refuse a symlinked private output root.');
  const report = JSON.parse(await readFile(resolve(privateRoot, 'macos-out/latest.json'), 'utf8'));
  assert.equal(report.localPreviewOnly, true, 'Only the authorized local-preview build can be packaged.');
  assert.equal(report.published, false, 'Source build must not already be published.');
  const app = resolve(root, report.app);
  const zip = resolve(root, report.zip);
  const appName = appDirectoryName(await readdir(dirname(app)));
  assert.equal(appName, app.split(sep).at(-1));
  assert.equal(await realpath(app), app);
  // Re-verify the sealed bundle before it goes into the DMG.
  for (const file of report.files) {
    const bytes = await readFile(resolve(app, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(hash(bytes), file.sha256, file.path);
  }
  assert.equal(hash(await readFile(zip)), report.zipSha256);

  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 8);
  const output = resolve(privateRoot, 'macos-out', `${stamp}-dmg`);
  await mkdir(output, { recursive: true });
  assert.equal(await realpath(output), output);
  const staging = resolve(output, 'staging');
  await mkdir(staging, { recursive: true });
  const dmg = resolve(output, dmgFileName(report.architecture));

  // Stage the app, an Applications shortcut and the private-release notes.
  run('/usr/bin/ditto', [app, resolve(staging, app.split(sep).at(-1))]);
  await symlink('/Applications', resolve(staging, 'Applications'));
  await writeFile(resolve(staging, 'READ-ME-FIRST.txt'), releaseReadme({
    version: report.version, zipSha256: report.zipSha256, architecture: report.architecture,
  }));
  const executable = resolve(staging, appName, 'Contents/MacOS/KujiraWallpaper');
  const readmePath = resolve(staging, 'READ-ME-FIRST.txt');
  await writeFile(resolve(staging, 'SHA256SUMS.txt'), [
    `${hash(await readFile(executable))}  ${appName}/Contents/MacOS/KujiraWallpaper`,
    `${hash(await readFile(readmePath))}  READ-ME-FIRST.txt`,
    '# DMGのSHA-256はリリースのSHA256SUMS.txtを参照してください。',
    '',
  ].join('\n'));

  run('/usr/bin/hdiutil', ['create', '-volname', 'くじらの散歩道 個人テスト', '-srcfolder', staging, '-ov', '-format', 'UDZO', '-fs', 'HFS+', dmg]);
  const dmgSha = hash(await readFile(dmg));

  // Mount read-only, verify the signature and run the packaged self-tests from the image.
  const mount = resolve(output, 'mount');
  await mkdir(mount, { recursive: true });
  let mounted = false;
  const verification = resolve(output, 'verification');
  try {
    run('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
    mounted = true;
    const mountedApp = resolve(mount, app.split(sep).at(-1));
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', mountedApp]);
    run(resolve(mountedApp, 'Contents/MacOS/KujiraWallpaper'), ['--self-test'], { cwd: output, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });
    run(resolve(mountedApp, 'Contents/MacOS/KujiraWallpaper'), ['--fighters-self-test'], { cwd: output, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });
    // Copy out of the image, then prove the copied app still runs standalone.
    await mkdir(verification, { recursive: true });
    run('/usr/bin/ditto', [mountedApp, resolve(verification, app.split(sep).at(-1))]);
  } finally {
    if (mounted) run('/usr/bin/hdiutil', ['detach', '-force', mount]);
  }
  const copiedApp = resolve(verification, app.split(sep).at(-1));
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', copiedApp]);
  run(resolve(copiedApp, 'Contents/MacOS/KujiraWallpaper'), ['--self-test'], { cwd: verification, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });
  run(resolve(copiedApp, 'Contents/MacOS/KujiraWallpaper'), ['--fighters-self-test'], { cwd: verification, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });

  const stat = await lstat(dmg);
  const receipt = {
    schemaVersion: 1, dmg: relative(root, dmg), bytes: stat.size, sha256: dmgSha,
    architecture: report.architecture, minimumMacOS: report.minimumMacOS, version: report.version,
    sourceApp: report.app, sourceZip: report.zip, sourceZipSha256: report.zipSha256,
    mountedReadOnlyVerified: true, copiedOutSelfTest: true, notarized: false,
    privateTestRelease: true, publishedAtBuild: false, autoStart: false, wallpaperChanged: false,
    notes: 'Private test release DMG. Not for public distribution; art rights unverified.',
  };
  await writeFile(resolve(output, 'dmg-report.json'), JSON.stringify(receipt, null, 2) + '\n');
  await rm(staging, { recursive: true, force: true });
  console.log(`DMG_READY: ${receipt.dmg}`);
  console.log(`DMG_SHA256: ${dmgSha}`);
  console.log('Private test release. Not notarized; art rights unverified.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
