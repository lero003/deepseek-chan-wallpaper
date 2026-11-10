import { keyIntent } from '../fighters/input.ts';
import type { Action } from '../fighters/types.ts';

interface InputCallbacks {
  active(): boolean;
  movement(x:number,y:number): void;
  action(action:Action): void;
  pause(): void;
  focus(focused:boolean): void;
}
/** Local element listeners only; no document/window/global key capture. */
export class GameInput {
  private readonly held = new Set<string>();
  private readonly scene: HTMLElement;
  private readonly callbacks: InputCallbacks;
  constructor(scene: HTMLElement, callbacks: InputCallbacks, signal: AbortSignal) {
    this.scene=scene;this.callbacks=callbacks;
    scene.addEventListener('keydown', event => this.key(event,true), {signal});
    scene.addEventListener('keyup', event => this.key(event,false), {signal});
    scene.addEventListener('pointerdown', () => { if(callbacks.active()) scene.focus({preventScroll:true}); }, {signal});
    document.addEventListener('focusin', () => this.syncFocus(), {signal});
    document.addEventListener('focusout', () => { this.clear(); queueMicrotask(() => { if(!signal.aborted)this.syncFocus(); }); }, {signal});
    window.addEventListener('blur', () => { this.clear();callbacks.focus(false); }, {signal});
    window.addEventListener('focus', () => this.syncFocus(), {signal});
  }
  clear(): void { this.held.clear();this.callbacks.movement(0,0); }
  syncFocus(): void {
    const element=document.activeElement;
    const focused=this.callbacks.active() && document.hasFocus() && element instanceof Element && element.closest('[data-game-input]') !== null;
    if(!focused)this.clear();
    this.callbacks.focus(focused);
  }
  private key(event: KeyboardEvent, down: boolean): void {
    if(!this.callbacks.active() || document.activeElement!==this.scene || !document.hasFocus())return;
    // A modified keydown must release movement, but modified keyup still clears its key.
    if(down&&(event.metaKey||event.ctrlKey||event.altKey)){this.clear();return;}
    const intent=keyIntent(event.key);if(!intent)return;
    event.preventDefault();
    if(intent.kind==='move') {
      if(down)this.held.add(event.key.toLowerCase());else this.held.delete(event.key.toLowerCase());
      let x=0,y=0;
      for(const key of this.held){const item=keyIntent(key);if(item?.kind==='move'){if(item.axis==='x')x+=item.direction;else y+=item.direction;}}
      this.callbacks.movement(Math.max(-1,Math.min(1,x)),Math.max(-1,Math.min(1,y)));
    } else if(down&&!event.repeat) {
      if(intent.kind==='action')this.callbacks.action(intent.action);else{this.clear();this.callbacks.pause();}
    }
  }
}
