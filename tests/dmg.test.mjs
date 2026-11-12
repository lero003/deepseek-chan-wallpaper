import test from 'node:test';
import assert from 'node:assert/strict';
import { dmgFileName, releaseReadme } from '../scripts/build-dmg.mjs';

test('the private release DMG name is architecture-specific and clearly a test build', () => {
  const name = dmgFileName('arm64');
  assert.match(name, /^KujiraWallpaper-Brushup-B11-arm64\.dmg$/);
  assert.equal(/\s/.test(name), false);
  assert.equal(name.includes('draft'), false);
});
test('the DMG readme states the private, unnotarized and rights-unverified limits', () => {
  const text = releaseReadme({ version: '0.1.0', zipSha256: 'a'.repeat(64), architecture: 'arm64' });
  for (const expected of ['非公開リリース', '再配布', '公証', '未確認', 'arm64', 'macOS 14', '元の壁紙設定は変更しません', 'SHA256SUMS.txt']) {
    assert.ok(text.includes(expected), expected);
  }
  assert.equal(text.includes('/Users/'), false);
  assert.equal(text.includes('公開配布物・正式リリースではありません'), true);
});