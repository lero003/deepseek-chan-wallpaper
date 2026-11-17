// Owner-approved public macOS release pipeline (GitHub Releases path).
// One run: Release build + Developer ID signing -> DMG -> Apple notarization ->
// staple -> verification -> SHA-256 -> manifest. It never publishes anything;
// publishing stays a separate, explicit owner action.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, symlink, rm, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './prepare-macos.mjs';
import { appDirectoryName } from './macos-archive.mjs';
import { BUNDLE_BUILD } from './build-info.mjs';

const NOTARY_PROFILE = 'kujira-release';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}).`);
  return result;
};
const capture = (command, args, options = {}) => run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options }).stdout.trim();

export function dmgFileName(version, architecture) {
  assert.match(version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
  assert.equal(architecture, 'arm64', 'The public release is Apple Silicon only for now.');
  return `KujiraWalkway-${version}-B${BUNDLE_BUILD}-${architecture}.dmg`;
}

/** Accept only a freshly sealed Developer ID build report for the public path. */
export function validateReleaseSource(report) {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.bundleBuild, BUNDLE_BUILD);
  assert.equal(report.architecture, 'arm64');
  assert.equal(report.minimumMacOS, '14.0');
  assert.match(report.signing, /^Developer ID Application: .+hardened runtime, secure timestamp/);
  assert.match(report.signingIdentityHash, /^[0-9A-F]{40}$/);
  assert.equal(report.notarized, false, 'The build script must not claim notarization.');
  assert.equal(report.localPreviewOnly, false);
  assert.equal(report.published, false);
  assert.equal(report.autoStartEnabled, false);
  assert.equal(report.originalWallpaperChangedDuringBuild, false);
  for (const key of ['archiveVerified', 'relocatedStandaloneSelfTest', 'relocatedFightersSelfTest']) assert.equal(report[key], true, key);
  assert.match(report.zip, new RegExp(`KujiraWallpaper-B${BUNDLE_BUILD}-arm64-developer-id\\.zip$`));
  assert.match(report.zipSha256, /^[a-f0-9]{64}$/);
  assert.ok(report.app.startsWith('private-art/macos-out/') && report.app.endsWith('.app'));
}

export function releaseReadme({ version, architecture, sourceCommit, zipSha256 }) {
  assert.match(zipSha256, /^[a-f0-9]{64}$/);
  assert.match(sourceCommit, /^[a-f0-9]{40,64}$/);
  return `くじらの散歩道 ${version}（Build ${BUNDLE_BUILD}）
==================================================

夕暮れの海を望む書斎を、すべてのディスプレイに静かに表示する壁紙アプリです。
音・通信・解析・ログイン自動起動はありません。壁紙は明示的にONにしたときだけ
表示され、macOSの元の壁紙設定は変更しません。

対応環境
- Apple Silicon（arm64）／ macOS 14 以降
- Apple公証済み・Developer ID署名・Hardened Runtime

インストール
1. このディスクイメージを開き、「くじらの散歩道.app」を Applications フォルダへ
   ドラッグします。
2. Applications から起動します。初回はプレビューだけが開きます。
3. 壁紙を表示するには「壁紙にする」を、やめるには「OFFにする」を選びます。
4. モードは「書斎で過ごす」「リュミエとゆっくり対戦」。背景は5種類から選べ、
   選択は保存されます。手動対戦は壁紙OFF時だけのオプションです。

アンインストール
アプリを終了し、Applications から「くじらの散歩道.app」をゴミへ移すだけです。
設定は ~/Library/Preferences/local.kujira.walkway.plist に保存されるため、
合わせて削除できます。macOSの壁紙設定・ログイン項目は変更していません。

プライバシー
- 一切の外部通信・解析・アカウント・自動起動はありません。
- 保存されるのは背景・モード・一時停止などのローカル設定のみです。

著作権・帰属
- 非公式のファン作品です。キャラクター原案・デザインはファンコミュニティと
  原案者に帰属します。DeepSeek社との提携・承認はありません。
- 同梱素材の第三者への再配布ライセンスは付与されていません。公開は
  プロジェクト所有者の許諾確認が完了した配布物に限ってください。

検証情報
-  version ${version}（bundle build ${BUNDLE_BUILD}）/ commit ${sourceCommit}
- 同梱ZIP SHA-256: ${zipSha256}
- DMGのSHA-256はリリースの SHA256SUMS.txt を確認してください。
- 不具合報告: GitHub リポジトリの Issue（公開後はリリースページ参照）
`;
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Run the macOS release pipeline on macOS.');
  const root = await realpath(projectRoot);
  // 1) Release build with Developer ID signing (full existing gates run inside).
  run(process.execPath, [resolve(root, 'scripts/build-macos.mjs'), '--local-preview', '--developer-id'], { cwd: root });
  const report = JSON.parse(await readFile(resolve(root, 'private-art/macos-out/latest.json'), 'utf8'));
  validateReleaseSource(report);
  const sourceCommit = capture('git', ['rev-parse', 'HEAD'], { cwd: root });
  const app = resolve(root, report.app);
  const zip = resolve(root, report.zip);
  const appName = appDirectoryName(await readdir(dirname(app)));
  assert.equal(appName, app.split('/').at(-1));
  assert.equal(await realpath(app), app);
  // Re-verify every sealed byte before packaging.
  for (const file of report.files) {
    const bytes = await readFile(resolve(app, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(hash(bytes), file.sha256, file.path);
  }
  assert.equal(hash(await readFile(zip)), report.zipSha256);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);

  // 2) Distribution DMG: signed app + /Applications shortcut + notes.
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 8);
  const output = resolve(root, 'private-art/macos-out', stamp);
  await mkdir(output, { recursive: true });
  assert.equal(await realpath(output), output);
  const staging = resolve(output, 'staging');
  await mkdir(staging, { recursive: true });
  const dmgName = dmgFileName(report.version, report.architecture);
  const dmg = resolve(output, dmgName);
  run('/usr/bin/ditto', [app, resolve(staging, appName)]);
  await symlink('/Applications', resolve(staging, 'Applications'));
  const readmeText = releaseReadme({ version: report.version, architecture: report.architecture, sourceCommit, zipSha256: report.zipSha256 });
  await writeFile(resolve(staging, 'READ-ME-FIRST.txt'), readmeText);
  const executable = resolve(staging, appName, 'Contents/MacOS/KujiraWallpaper');
  await writeFile(resolve(staging, 'SHA256SUMS.txt'), [
    `${hash(await readFile(executable))}  ${appName}/Contents/MacOS/KujiraWallpaper`,
    `${hash(await readFile(resolve(staging, 'READ-ME-FIRST.txt')))}  READ-ME-FIRST.txt`,
    '',
  ].join('\n'));
  run('/usr/bin/hdiutil', ['create', '-volname', 'くじらの散歩道', '-srcfolder', staging, '-ov', '-format', 'UDZO', '-fs', 'HFS+', dmg]);
  await rm(staging, { recursive: true, force: true });

  // 3) Notarize the DMG with the pre-existing keychain profile. Never print credentials.
  run('/usr/bin/xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', NOTARY_PROFILE, '--wait']);

  // 4) Staple the notarization ticket and validate it. Stapling rewrites the DMG,
  // so every published checksum must be computed only after this point.
  run('/usr/bin/xcrun', ['stapler', 'staple', dmg]);
  run('/usr/bin/xcrun', ['stapler', 'validate', dmg]);
  const dmgSha = hash(await readFile(dmg));

  // 5) Distribution verification: mount read-only, assess, run self-tests, copy out.
  const mount = resolve(output, 'mount');
  await mkdir(mount, { recursive: true });
  const verification = resolve(output, 'verification');
  let mounted = false;
  try {
    run('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
    mounted = true;
    const mountedApp = resolve(mount, appName);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', mountedApp]);
    run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', mountedApp]);
    run(resolve(mountedApp, 'Contents/MacOS/KujiraWallpaper'), ['--self-test'], { cwd: output, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });
    run(resolve(mountedApp, 'Contents/MacOS/KujiraWallpaper'), ['--fighters-self-test'], { cwd: output, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });
    await mkdir(verification, { recursive: true });
    run('/usr/bin/ditto', [mountedApp, resolve(verification, appName)]);
  } finally {
    if (mounted) run('/usr/bin/hdiutil', ['detach', '-force', mount]);
  }
  const copiedApp = resolve(verification, appName);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', copiedApp]);
  // The user actually runs the app after dragging it out of the DMG, so Gatekeeper
  // must accept the copied-out bundle, not just the read-only image copy.
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', copiedApp]);
  run(resolve(copiedApp, 'Contents/MacOS/KujiraWallpaper'), ['--self-test'], { cwd: verification, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });
  run(resolve(copiedApp, 'Contents/MacOS/KujiraWallpaper'), ['--fighters-self-test'], { cwd: verification, env: { PATH: '/usr/bin:/bin', LANG: 'ja_JP.UTF-8' } });

  // 6) Release assets: checksums, notes, manifest. The DMG already lives in the output directory.
  await writeFile(resolve(output, 'SHA256SUMS.txt'), `${dmgSha}  ${dmgName}\n`);
  await writeFile(resolve(output, 'release-notes.txt'), readmeText);
  const stat = await lstat(dmg);
  const manifest = {
    schemaVersion: 1, version: report.version, bundleBuild: report.bundleBuild,
    architecture: report.architecture, minimumMacOS: report.minimumMacOS,
    bundleId: 'local.kujira.walkway', dmg: relative(root, resolve(output, dmgName)),
    bytes: stat.size, sha256: dmgSha, sourceZip: report.zip, sourceZipSha256: report.zipSha256,
    sourceCommit, signing: report.signing, signingIdentityHash: report.signingIdentityHash,
    notarization: 'submitted with keychain profile kujira-release; notarytool --wait returned Accepted',
    stapled: true, staplerValidated: true, gatekeeperAssessed: true,
    mountedReadOnlyVerified: true, copiedOutSelfTest: true,
    published: false, notes: 'Art redistribution rights confirmed by the project owner (2026-11-17). Publishing still requires an explicit owner action; the repo is currently private, so the Release is not publicly downloadable.',
  };
  await writeFile(resolve(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`DMG_READY: ${manifest.dmg}`);
  console.log(`DMG_SHA256: ${dmgSha}`);
  console.log('Notarized and stapled. NOT published; publishing requires the explicit owner action.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
