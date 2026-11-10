import test from 'node:test';
import assert from 'node:assert/strict';
import { dmgFileName, draftReadme } from '../scripts/build-dmg.mjs';

test('the draft DMG name is architecture-specific and clearly a draft', () => {
  const name = dmgFileName('arm64');
  assert.match(name, /^KujiraWallpaper-Fighters-MVP4-draft-arm64\.dmg$/);
  assert.equal(/\s/.test(name), false);
});
test('the DMG readme states the private, unnotarized and rights-unverified limits', () => {
  const text = draftReadme({ version: '0.1.0', zipSha256: 'a'.repeat(64), architecture: 'arm64' });
  for (const expected of ['非公開ドラフト', '再配布', '公証', '未確認', 'arm64', 'macOS 14', '元の壁紙設定は変更しません', 'SHA256SUMS.txt']) {
    assert.ok(text.includes(expected), expected);
  }
  assert.equal(text.includes('/Users/'), false);
  assert.equal(text.includes('公開配布物・正式リリースではありません'), true);
});
