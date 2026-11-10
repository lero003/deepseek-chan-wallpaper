import { SEASIDE } from '../world/world.ts';
import type { ArtProfile } from '../app-web/art-profile.ts';

type LayoutProfile = Omit<ArtProfile, 'backgroundUrl' | 'characterUrl' | 'atlas' | 'manifest'>;

export const PLACEHOLDER_LAYOUT: LayoutProfile = {
  id: 'placeholder-v01', kind: 'placeholder', label: '海辺の書斎・初期仮素材', scene: SEASIDE,
  description: '海を望む小さな書斎。初期仮素材のクジラ娘が床を歩き、立ち止まり、ときどき眠ります。',
  provenance: '現在は再現可能なプログラム描画の初期仮素材です。承認済みデザインの生成素材は別のローカルアートプロファイルで管理しています。',
};

// Layout and technical metadata only. Character/reference images stay Git-ignored.
export const SUNSET_LAYOUT: LayoutProfile = {
  id: 'whale-maid-sunset-v1', kind: 'local-design', label: '夕凪の書斎',
  scene: { width: 480, height: 270, floorY: 236, actorHalfWidth: 40, obstacles: [{ left: 0, right: 94 }, { left: 402, right: 480 }] },
  description: '夕暮れの海を望む書斎。青紫の髪とヒレ耳、クジラの尾を持つメイドの女の子が歩き、立ち止まり、ときどき眠ります。',
  provenance: 'ユーザー承認済みの基準絵を参照し、GPT Imageで制作したローカル専用のドット絵です。原寸確認・透過・減色・接地整列を行っています。',
  ceilingColor: '#40344b', floorColor: '#866077', shadowColor: '#34273e',
  water: { left: 115, right: 349, top: 120, bottom: 158 },
};
