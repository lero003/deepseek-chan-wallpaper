/**
 * The personal settings this quiet wallpaper remembers — nothing else.
 *
 * Still (the persistent pause), low power and background id. Battle progress,
 * score and keys are never stored; the fighters feature is shelved and has no
 * settings surface. Storage is best-effort: private browsing, disabled storage
 * or a full quota must never break the scene, and every value is validated on
 * read so corrupt or foreign data falls back to the defaults field by field.
 */
export interface PersonalSettings {
  /** 静止画で眺める — the persistent pause setting (the footer pause stays transient). */
  still: boolean;
  /** 省電力にする — 15fps instead of 30fps. */
  power: boolean;
  /** 'sunset' or a background variant id; ids survive variant load failures. */
  background: string;
}

export const DEFAULT_SETTINGS: PersonalSettings = {
  still: false, power: false, background: 'sunset',
};

export const SETTINGS_KEY = 'kujira.settings.v1';

/** The narrow storage surface we need; both accessors may throw in private modes. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Background ids are short lowercase slugs, exactly like the prepared variants. */
export function isBackgroundId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[a-z0-9-]+$/.test(value);
}

/** Parse one stored payload; unknown shapes and bad fields fall back per field. */
export function parseSettings(raw: string | null): PersonalSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (raw === null) return settings;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return settings; }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return settings;
  const record = data as Record<string, unknown>;
  if (typeof record.still === 'boolean') settings.still = record.still;
  if (typeof record.power === 'boolean') settings.power = record.power;
  if (isBackgroundId(record.background)) settings.background = record.background;
  return settings;
}

/** Read the raw payload without ever throwing; null means "nothing stored". */
export function readSettingsRaw(storage: SettingsStorage | null): string | null {
  try { return storage?.getItem(SETTINGS_KEY) ?? null; } catch { return null; }
}

export function loadSettings(storage: SettingsStorage | null): PersonalSettings {
  return parseSettings(readSettingsRaw(storage));
}

/** Persist exactly the three fields; a storage failure is silently non-fatal. */
export function saveSettings(storage: SettingsStorage | null, settings: PersonalSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify({
      still: settings.still, power: settings.power, background: settings.background,
    }));
  } catch { /* Best-effort only: the scene keeps running without persistence. */ }
}

/** The browser's localStorage, or null when access itself throws. */
export function localSettingsStorage(): SettingsStorage | null {
  try { return window.localStorage; } catch { return null; }
}
