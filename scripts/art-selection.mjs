import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Selection is project-local and explicit. A placeholder build never loads private art. */
export function selectArtEntry(projectRoot, mode, exists = existsSync) {
  const fallback = resolve(projectRoot, 'src/app-web/default-art.ts');
  const local = resolve(projectRoot, 'private-art/runtime/art.ts');
  return mode !== 'placeholder' && exists(local) ? local : fallback;
}
