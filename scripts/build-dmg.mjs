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

export const RELEASE_SOURCE_TAG = 'multi-display-build15';
export function dmgFileName(architecture) {
  assert.equal(architecture, 'arm64', 'This personal preview is Apple Silicon only.');
  return `KujiraWallpaper-MultiDisplay-B15-${architecture}.dmg`;
}

/** Reject stale/placeholder/unverified builds before copying or mounting anything. */
export function validateDmgSource(report) {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.bundleBuild, '15', 'Build15 DMG requires the sealed Build15 app.');
  assert.equal(report.profile, 'whale-maid-sunset-v1', 'Do not label the placeholder as the local-art release.');
  dmgFileName(report.architecture);
  assert.equal(report.minimumMacOS, '14.0');
  assert.equal(report.localPreviewOnly, true);
  assert.equal(report.published, false);
  for (const key of ['archiveVerified', 'relocatedStandaloneSelfTest', 'relocatedFightersSelfTest']) assert.equal(report[key], true, key);
  assert.equal(report.autoStartEnabled, false);
  assert.equal(report.originalWallpaperChangedDuringBuild, false);
  assert.ok(Array.isArray(report.bundledLifeGestures));
  assert.deepEqual([...report.bundledLifeGestures].sort(), ['daydream', 'giggle', 'hop', 'peek', 'stretch', 'sway']);
  for (const path of [report.app, report.zip]) {
    assert.equal(typeof path, 'string');
    assert.ok(path.startsWith('private-art/macos-out/') && !path.includes('\\') && !path.split('/').some(part => part === '..' || part === '.' || part === ''), 'Unsafe build report path.');
  }
  assert.match(report.app, /\.app$/);
  assert.match(report.zip, /KujiraWallpaper-MultiDisplay-B15-arm64-local-preview\.zip$/);
  assert.match(report.zipSha256, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(report.files) && report.files.length > 0);
  for (const file of report.files) {
    assert.equal(typeof file.path, 'string');
    assert.ok(!file.path.startsWith('/') && !file.path.includes('\\') && !file.path.split('/').some(part => part === '..' || part === '.' || part === ''), 'Unsafe bundle file path.');
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes >= 0);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
}

export function releaseReadme({ version, zipSha256, architecture, sourceTag = RELEASE_SOURCE_TAG, sourceCommit }) {
  dmgFileName(architecture);
  assert.match(zipSha256, /^[a-f0-9]{64}$/);
  assert.equal(sourceTag, RELEASE_SOURCE_TAG);
  assert.match(sourceCommit, /^[a-f0-9]{40,64}$/);
  return `くじらの散歩道 — 全ディスプレイ同期 Build 15（個人テスト用）
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
4. シーン下の「背景」で夕凪・月夜・雨音・朝凪・雪あかりを切り替え（「雨音」は景色で音は鳴りません）。
   「呼んでみる」で、書斎で休んでいるDeepSeekちゃんが小さく応えます。
5. 手動操作: WASD／矢印で移動、J/Zで3段コンボ、K/Xで回避、L/Cで必殺、
   Escでポーズ。メニューバーから「書斎へ戻る」「もう一度遊ぶ」。
6. 音は常時無音。通信・解析・ログイン自動起動はありません。

今回の変更（Build 15）
- 壁紙をメインディスプレイだけでなく、接続中のすべてのディスプレイへ同期表示。
  各ディスプレイに独立した整数倍の描画面を置き、同じDeepSeekちゃんの生活を映す。
- ディスプレイの追加・切断・配置変更を検知してパネルを張り直す。
  ミラーリングで同じ座標になる画面は重複ウィンドウを作らない。
- Build 14の6種類の仕草（小さなジャンプ・くすくす笑い・小さなダンス・
  照れ覗きと手振り・のび・尾との戯れ）と専用24コマを引き継ぎ。
- 承認済み生活16コマ、背景5種、広い壁紙、戦闘8姿勢、複数ライバルを引き継ぎ。
- 壁紙・元の背景設定・ログイン自動起動は変更しない。クリックは全画面で透過。

Build 12までの主な内容
- 通常待機中に3ボスが1体ずつ遊びに来て、歩き・会釈し・帰る（Build 12）
- 16:9以外の戦闘背景を単色の額で囲み、端を引き伸ばさない（Build 11）
- 「呼んでみる」、生活キャプション、背景選択（Build 10まで）

検証済み（このDMGの作成時）
- 署名検証、DMGの読取専用マウント、DMG外へコピー後の単体起動
- 同梱素材のハッシュ、自己テスト2種、元ZIPとのbyte一致
- Node 257テスト、Swift 43テスト×2プロファイル、Webビルド（通常・placeholder）
未確認
- 実画面での複数ディスプレイ同期、6仕草の見え方・頻度・キー切替、キー操作の感触
- 壁紙ON/OFF、Space、スリープ復帰、30分のCPU・メモリ・発熱
- 別のMac／OS、異なる画面解像度・配置、Gatekeeperの挙動、実時間の連続動作

記録
- アプリ版: ${version}（bundle build 15）
- 元ソース: ${sourceTag} / ${sourceCommit}
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
  validateDmgSource(report);
  const sourceCommit = capture('git', ['rev-parse', `${RELEASE_SOURCE_TAG}^{}`], { cwd: root });
  assert.match(sourceCommit, /^[a-f0-9]{40,64}$/, 'The sealed app must come from the recorded Build15 source tag.');
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
    sourceTag: RELEASE_SOURCE_TAG, sourceCommit: sourceCommit,
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
    sourceTag: RELEASE_SOURCE_TAG, sourceCommit: sourceCommit,
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
