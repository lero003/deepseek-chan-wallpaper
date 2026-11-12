import test from 'node:test';
import assert from 'node:assert/strict';
import { dmgFileName, releaseReadme, validateDmgSource,
  RELEASE_SOURCE_TAG, RELEASE_SOURCE_COMMIT } from '../scripts/build-dmg.mjs';

const valid = {
  schemaVersion: 1, bundleBuild: '14', profile: 'whale-maid-sunset-v1', architecture: 'arm64',
  minimumMacOS: '14.0', localPreviewOnly: true, published: false,
  archiveVerified: true, relocatedStandaloneSelfTest: true, relocatedFightersSelfTest: true,
  autoStartEnabled: false, originalWallpaperChangedDuringBuild: false,
  bundledLifeGestures: ['hop', 'giggle', 'sway', 'peek', 'stretch', 'daydream'],
  app: 'private-art/macos-out/20261112213257-5a6c6a4f/くじらの散歩道.app',
  zip: 'private-art/macos-out/20261112213257-5a6c6a4f/KujiraWallpaper-LifeMotion-B14-arm64-local-preview.zip',
  zipSha256: 'a'.repeat(64),
  files: [{ path: 'Contents/MacOS/KujiraWallpaper', bytes: 10, sha256: 'b'.repeat(64) }],
};

test('the private release DMG is named for Life Motion Build 14 and Apple Silicon only', () => {
  const name = dmgFileName('arm64');
  assert.equal(name, 'KujiraWallpaper-LifeMotion-B14-arm64.dmg');
  assert.equal(/\s/.test(name), false);
  assert.equal(name.includes('draft'), false);
  assert.throws(() => dmgFileName('x64'));
});

test('the packaging gate rejects stale, placeholder, unpublished-unverified or path-escaping builds', () => {
  assert.doesNotThrow(() => validateDmgSource(valid));
  const fields = [
    ['bundleBuild', '13'], ['profile', 'placeholder-v1'], ['localPreviewOnly', false],
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

test('the DMG readme states Build14 gestures, source provenance and private, unnotarized limits', () => {
  const text = releaseReadme({ version: '0.1.0', zipSha256: 'a'.repeat(64), architecture: 'arm64' });
  for (const expected of ['生活モーション Build 14', '非公開リリース', '再配布', '公証', '未確認',
    'arm64', 'macOS 14', '元の壁紙設定は変更しません', 'SHA256SUMS.txt', 'bundle build 14',
    RELEASE_SOURCE_TAG, RELEASE_SOURCE_COMMIT, '小さなジャンプ', 'くすくす笑い', '小さなダンス',
    '照れ覗き', 'のび', '自分の尾との戯れ', '承認済み生活16コマ', 'Node 257テスト', 'Swift 39テスト']) {
    assert.ok(text.includes(expected), expected);
  }
  for (const forbidden of ['/Users/', 'Build 13（個人テスト用）', 'Node 229テスト', 'Swift 29テスト']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.equal(text.includes('公開配布物・正式リリースではありません'), true);
  assert.throws(() => releaseReadme({ version: '0.1.0', zipSha256: 'a'.repeat(64), architecture: 'arm64',
    sourceCommit: 'c'.repeat(40) }));
});
