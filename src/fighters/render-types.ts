import type { GameUI } from './types.ts';
export type DrawCommand =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; color: string; alpha: number; rotation?: number }
  | { kind: 'sprite'; x: number; y: number; frame: number; facing: number; alpha: number; rotation: number; scaleX: number; scaleY: number }
  | { kind: 'text'; x: number; y: number; text: string; color: string; alpha: number; size: number };
export interface BattleFrame { cameraX: number; commands: DrawCommand[] }
export interface GamePresentation { game?: GameUI; battle?: BattleFrame; overlay?: DrawCommand[] }
