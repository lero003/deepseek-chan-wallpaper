import test from 'node:test';
import assert from 'node:assert/strict';
import { dmgFileName, releaseReadme, validateDmgSource, RELEASE_SOURCE_TAG } from '../scripts/build-dmg.mjs';

const valid = {
  schemaVersion: 1, bundleBuild: '19', profile: 'whale-maid-sunset-v1', architecture: 'arm64',
  minimumMacOS: '14.0', localPreviewOnly: true, published: false,
  archiveVerified: true, relocatedStandaloneSelfTest: true, relocatedFightersSelfTest: true,
  autoStartEnabled: false, originalWallpaperChangedDuringBuild: false,
  bundledLifeGestures: ['hop', 'giggle', 'sway', 'peek', 'stretch', 'daydream'],
  app: 'private-art/macos-out/example/くじらの散歩道.app',
  zip: 'private-art/macos-out/example/KujiraWallpaper-Sparring-B19-arm64-local-preview.zip',
  zipSha256: 'a'.repeat(64),
  files: [{ path: 'Contents/MacOS/KujiraWallpaper', bytes: 10, sha256: 'b'.repeat(64) }],
};

test('the private release DMG is named for Sparring Build 19 and Apple Silicon only', () => {
  const name = dmgFileName('arm64');
  assert.equal(name, 'KujiraWallpaper-Sparring-B19-arm64.dmg');
  assert.equal(/\s/.test(name), false);
  assert.equal(name.includes('draft'), false);
  assert.throws(() => dmgFileName('x64'));
});

test('the packaging gate rejects stale, placeholder, unpublished-unverified or path-escaping builds', () => {
  assert.doesNotThrow(() => validateDmgSource(valid));
  const fields = [
    ['bundleBuild', '18'], ['profile', 'placeholder-v1'], ['localPreviewOnly', false],
    ['published', true], ['archiveVerified', false], ['relocatedStandaloneSelfTest', false],
    ['relocatedFightersSelfTest', false], ['autoStartEnabled', true],
    ['originalWallpaperChangedDuringBuild', true], ['architecture', 'x64'],
  ];
  for (const [key, value] of fields) {
    const copy = structuredClone(valid); copy[key] = value;
    assert.throws(() => validateDmgSource(copy), key);
  }
  for (const mutate of [
    report => { report.app = '/tmp/くじらの散歩道.app'; },
    report => { report.app = 'private-art/macos-out/../escape.app'; },
    report => { report.zip = 'private-art/other.zip'; },
    report => { report.zipSha256 = 'not-a-hash'; },
    report => { report.files = []; },
    report => { report.files = [{ path: '../escape', bytes: 1, sha256: 'b'.repeat(64) }]; },
    report => { report.files = [{ path: 'ok', bytes: -1, sha256: 'b'.repeat(64) }]; },
    report => { report.files = [{ path: 'ok', bytes: 1, sha256: 'nope' }]; },
    report => { report.bundledLifeGestures = ['hop']; },
    report => { delete report.bundledLifeGestures; },
  ]) {
    const copy = structuredClone(valid); mutate(copy);
    assert.throws(() => validateDmgSource(copy));
  }
});

test('the DMG readme states Build19 sparring behavior, source provenance and private limits', () => {
  const text = releaseReadme({ version: '0.1.0', zipSha256: 'a'.repeat(64), architecture: 'arm64', sourceCommit: 'c'.repeat(40) });
  for (const expected of ['ゆっくり対戦 Build 19', '非公開リリース', '再配布', '公証', '未確認',
    'arm64', 'macOS 14', '元の壁紙設定は変更しません', 'SHA256SUMS.txt', 'bundle build 19',
    RELEASE_SOURCE_TAG, '誰も倒れない', '壁紙がOFFのときだけ手動3連戦', 'mode: sparring',
    '全ディスプレイ同期', '生活6仕草', '承認済み', 'Node 264テスト', 'Swift 44テスト']) {
    assert.ok(text.includes(expected), expected);
  }
  for (const forbidden of ['/Users/', '全ディスプレイ同期 Build 15（個人テスト用）', 'bundle build 15', 'Node 257テスト', 'Swift 43テスト']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.equal(text.includes('公開配布物・正式リリースではありません'), true);
  assert.throws(() => releaseReadme({ version: '0.1.0', zipSha256: 'a'.repeat(64), architecture: 'arm64',
    sourceCommit: 'not-a-commit' }));
});
