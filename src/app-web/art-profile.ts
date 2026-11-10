import type { Scene } from '../world/world.ts';

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

export interface RenderAppearance {
  readonly ceilingColor?: string;
  readonly floorColor?: string;
  readonly shadowColor?: string;
  readonly water?: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
}

export interface ArtProfile extends RenderAppearance {
  readonly id: string;
  readonly kind: 'placeholder' | 'local-design';
  readonly label: string;
  readonly backgroundUrl: string;
  readonly characterUrl: string;
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
