import type { Scene } from '../world/world.ts';
import type { BossAtlas } from '../fighters/render-types.ts';
import type { AmbienceProfile } from '../render/ambience.ts';
import type { PoseAtlas, PoseSheet } from '../fighters/pose-art.ts';

export interface AssetCredit {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly dimensions: string;
  readonly license: string;
  readonly author: string;
  readonly sha256: string;
  readonly permission: {
    readonly status: string;
    readonly webPublication: boolean;
    readonly sourceRedistribution: boolean;
    readonly macAppBundling: boolean;
  };
}

/** Geometry of the wallpaper matte: the room art placed inside a wider/taller canvas. */
export interface MatteInfo {
  readonly width: number;
  readonly height: number;
  readonly roomX: number;
  readonly roomY: number;
}

export interface RenderAppearance {
  readonly ceilingColor?: string;
  readonly floorColor?: string;
  readonly shadowColor?: string;
  /**
   * Flat colour behind the fixed 16:9 arena when the surface leaves margins around it.
   * The margins are never filled by stretching the art's edge column.
   */
  readonly arenaFrameColor?: string;
  readonly water?: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  /** Optional wide backdrop. When absent the renderer falls back to the old edge-stretched room. */
  readonly matte?: MatteInfo;
  /** Local-only rival sheet geometry; absent/invalid means the original code-only fallback. */
  readonly bossAtlas?: BossAtlas;
  /** Optional arena-only combat/mob sheets, independent of the approved life atlas. */
  readonly combatAtlas?: PoseAtlas;
  readonly slimeAtlas?: PoseAtlas;
  readonly popupAtlas?: PoseAtlas;
  /** Per-background ambient palette/episodes; absent means the approved sunset overlay. */
  readonly ambience?: AmbienceProfile;
  /**
   * True when a valid local painted terrace backdrop is loaded for the manual arena.
   * Set by the renderer/host, not by static profiles; it lets the shared plan skip the
   * code scenery's animated sky/sea/foreground over the complete painted scene.
   */
  readonly arenaArt?: boolean;
}

/** The subset of appearance a selectable background may override. */
export type VariantAppearance = Pick<RenderAppearance, 'ceilingColor' | 'floorColor' | 'shadowColor' | 'water' | 'ambience'>;

/** Merge a background's overrides onto the base appearance; undefined keeps the base. */
export function resolveAppearance(base: RenderAppearance, override?: VariantAppearance): RenderAppearance {
  if (!override) return base;
  return {
    ...base,
    ...(override.ceilingColor !== undefined ? { ceilingColor: override.ceilingColor } : {}),
    ...(override.floorColor !== undefined ? { floorColor: override.floorColor } : {}),
    ...(override.shadowColor !== undefined ? { shadowColor: override.shadowColor } : {}),
    ...(override.water !== undefined ? { water: override.water } : {}),
    ...(override.ambience !== undefined ? { ambience: override.ambience } : {}),
  };
}

/** A selectable wallpaper background. All variants share the approved 480×270 room geometry. */
export interface SceneVariant {
  readonly id: string;
  readonly label: string;
  readonly backgroundUrl: string;
  readonly matteUrl?: string;
  /** Optional ambient/life-rhythm overrides for this background. */
  readonly appearance?: VariantAppearance;
}

export interface ArtProfile extends RenderAppearance {
  readonly id: string;
  readonly kind: 'placeholder' | 'local-design';
  readonly label: string;
  readonly backgroundUrl: string;
  readonly characterUrl: string;
  /** Optional original rival image; no local file is required by the placeholder profile. */
  readonly bossUrl?: string;
  /** Optional wallpaper matte image. Only the local production profile provides it. */
  readonly matteUrl?: string;
  /**
   * Optional painted terrace backdrop (480×270) for the fixed manual arena only.
   * Local-preview art; absent/failed loads fall back to the code-drawn stage. The
   * passive wallpaper and in-room incidents never use it.
   */
  readonly arenaBackdropUrl?: string;
  /** Missing or failed optional sheets independently retain their original drawing. */
  readonly spriteUrls?: Partial<Readonly<Record<PoseSheet, string>>>;
  /** Additional selectable backgrounds (e.g. night, rain) built from the same room. */
  readonly variants?: readonly SceneVariant[];
  readonly atlas: unknown;
  readonly manifest: {
    readonly assets: readonly AssetCredit[];
    readonly note: string;
    readonly releaseGate: string;
  };
  readonly scene: Scene;
  readonly description: string;
  readonly provenance: string;
}
