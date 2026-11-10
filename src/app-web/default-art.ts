import backgroundUrl from '../../assets/scene/seaside-room.png?url';
import characterUrl from '../../assets/character/sheet.png?url';
import atlas from '../../assets/character/atlas.json';
import manifest from '../../assets/manifest.json';
import { PLACEHOLDER_LAYOUT } from '../art/scene-profiles.ts';
import type { ArtProfile } from './art-profile.ts';

// A clean clone remains runnable without any unapproved local art.
const art: ArtProfile = { ...PLACEHOLDER_LAYOUT, backgroundUrl, characterUrl, atlas, manifest };
export default art;
