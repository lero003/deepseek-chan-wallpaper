import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Selection is project-local and explicit. A placeholder build never loads private art.
 *  Mode `public` is the quiet-wallpaper web build for hazakura.dev/kujira/: it ships
 *  the production art but never the shelved combat-only assets. */
export function selectArtEntry(projectRoot, mode, exists = existsSync) {
  const fallback = resolve(projectRoot, 'src/app-web/default-art.ts');
  const local = resolve(projectRoot, 'private-art/runtime/art.ts');
  const publicEntry = resolve(projectRoot, 'private-art/runtime/art-public.ts');
  if (mode === 'public' && exists(publicEntry)) return publicEntry;
  return mode !== 'placeholder' && exists(local) ? local : fallback;
}
