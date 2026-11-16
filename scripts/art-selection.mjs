import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Selection is project-local and explicit. A placeholder build never loads private art.
 *  Mode `public` includes the authorized quiet-life and terrace-battle assets
 *  for hazakura.dev/kujira/. Masters stay ignored. */
export function selectArtEntry(projectRoot, mode, exists = existsSync) {
  const fallback = resolve(projectRoot, 'src/app-web/default-art.ts');
  const local = resolve(projectRoot, 'private-art/runtime/art.ts');
  const publicEntry = resolve(projectRoot, 'private-art/runtime/art-public.ts');
  if (mode === 'public' && exists(publicEntry)) return publicEntry;
  return mode !== 'placeholder' && exists(local) ? local : fallback;
}
