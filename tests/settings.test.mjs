import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS, SETTINGS_KEY, isBackgroundId,
  loadSettings, parseSettings, readSettingsRaw, saveSettings,
} from '../src/app-web/settings.ts';

/** A storage double that can also simulate private-mode/quota failures. */
function storage({ failRead = false, failWrite = false } = {}) {
  const data = new Map();
  return {
    data,
    getItem(key) { if (failRead) throw new Error('read denied'); return data.get(key) ?? null; },
    setItem(key, value) { if (failWrite) throw new Error('quota exceeded'); data.set(key, value); },
  };
}

test('absent or corrupt storage falls back to the three defaults', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(''), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{not json'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('[]'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('"text"'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('null'), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  const denied = storage({ failRead: true });
  assert.equal(readSettingsRaw(denied), null);
  assert.deepEqual(loadSettings(denied), DEFAULT_SETTINGS);
});

test('each field is validated independently; shelved or unknown fields are dropped', () => {
  const parsed = parseSettings(JSON.stringify({
    still: true, power: 'yes', background: 'night',
    // Left over from the shelved fighters surface and foreign payloads: ignored.
    frequency: 'off', effects: false, score: 9999, wallpaperOn: true, extra: { nested: 1 },
  }));
  assert.deepEqual(parsed, { still: true, power: false, background: 'night' });
  assert.deepEqual(parseSettings(JSON.stringify({ background: '../etc', still: 1 })), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(JSON.stringify({ background: 'X'.repeat(65) })), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(JSON.stringify({ background: 'UPPER' })), DEFAULT_SETTINGS);
});

test('saving writes exactly one key with exactly the three fields, and round-trips', () => {
  const store = storage();
  const settings = { still: true, power: true, background: 'snow' };
  saveSettings(store, settings);
  assert.deepEqual([...store.data.keys()], [SETTINGS_KEY]);
  assert.deepEqual(JSON.parse(store.data.get(SETTINGS_KEY)), settings);
  assert.deepEqual(loadSettings(store), settings);
  // A full quota or denied write is non-fatal and leaves no partial state behind.
  const denied = storage({ failWrite: true });
  assert.doesNotThrow(() => saveSettings(denied, settings));
  assert.equal(denied.data.size, 0);
  assert.doesNotThrow(() => saveSettings(null, settings));
});

test('the remembered background is an id slug', () => {
  assert.ok(isBackgroundId('sunset'));
  assert.ok(isBackgroundId('garden-dawn'));
  assert.ok(!isBackgroundId(''));
  assert.ok(!isBackgroundId('a/b'));
  assert.ok(!isBackgroundId('a b'));
  assert.ok(!isBackgroundId(42));
});

test('a first visit keeps defaults so the save-data hint can still apply', () => {
  const store = storage();
  assert.equal(readSettingsRaw(store), null);
  const settings = loadSettings(store);
  assert.equal(settings.power, false);
  // Only an explicit user change persists; loading alone never writes.
  assert.equal(store.data.size, 0);
});
