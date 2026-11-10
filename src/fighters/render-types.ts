import type { GameUI } from './types.ts';
export type DrawCommand =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; color: string; alpha: number; rotation?: number }
  | { kind: 'sprite'; x: number; y: number; frame: number; facing: number; alpha: number; rotation: number; scaleX: number; scaleY: number }
  | { kind: 'text'; x: number; y: number; text: string; color: string; alpha: number; size: number };
export interface BattleFrame {
  cameraX: number;
  commands: DrawCommand[];
  /**
   * True for the short automatic incident inside the study room: the renderer keeps
   * the wallpaper backdrop (room + wide matte) instead of the scrolling stage.
   */
  room?: boolean;
}
export interface GamePresentation { game?: GameUI; battle?: BattleFrame; overlay?: DrawCommand[] }
