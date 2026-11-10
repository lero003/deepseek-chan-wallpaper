import type { Action } from './types.ts';
export type KeyIntent = { kind: 'move'; axis: 'x' | 'y'; direction: -1 | 1 } | { kind: 'action'; action: Action } | { kind: 'pause' };
export function keyIntent(key: string): KeyIntent | null {
  switch(key.toLowerCase()) {
    case 'arrowleft': case 'a': return {kind:'move',axis:'x',direction:-1};
    case 'arrowright': case 'd': return {kind:'move',axis:'x',direction:1};
    case 'arrowup': case 'w': return {kind:'move',axis:'y',direction:-1};
    case 'arrowdown': case 's': return {kind:'move',axis:'y',direction:1};
    case 'j': case 'z': return {kind:'action',action:'attack'};
    case 'k': case 'x': return {kind:'action',action:'dodge'};
    case 'l': case 'c': return {kind:'action',action:'special'};
    case 'escape': return {kind:'pause'};
    default:return null;
  }
}
