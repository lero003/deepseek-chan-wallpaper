import { command, gameUI, setFocus, setMovement } from '../fighters/game.ts';
import type { FightersGame } from '../fighters/types.ts';
import { PHASE_NAMES } from '../fighters/definitions.ts';
import { GameInput } from './game-input.ts';

export class FightersUI {
  readonly input: GameInput;
  private lastAnnouncement='';
  constructor(private readonly game:FightersGame, private readonly scene:HTMLElement,
    private readonly canPlay:()=>boolean, changed:()=>void, signal:AbortSignal) {
    const action=(name:string,value?:unknown) => {command(game,name,value);this.sync();changed();};
    this.input=new GameInput(scene,{
      active:()=>game.mode==='manual'&&canPlay(),movement:(x,y)=>setMovement(game,x,y),
      action:name=>action(name),pause:()=>action('pause'),focus:focused=>setFocus(game,focused),
    },signal);
    this.button('play-button').addEventListener('click',()=>{action('play');scene.focus({preventScroll:true});this.input.syncFocus();changed();},{signal});
    this.button('demo-button').addEventListener('click',()=>action('demo'),{signal});
    this.button('game-home').addEventListener('click',()=>{this.input.clear();action('home');this.button('play-button').focus({preventScroll:true});},{signal});
    this.button('game-retry').addEventListener('click',()=>{action('retry');scene.focus({preventScroll:true});this.input.syncFocus();changed();},{signal});
    for(const name of ['attack','dodge','special','pause']){
      const button=this.button(`game-${name}`);
      button.addEventListener('pointerdown',event=>{if(game.mode==='manual')event.preventDefault();},{signal});
      button.addEventListener('click',()=>{scene.focus({preventScroll:true});this.input.syncFocus();action(name);},{signal});
    }
    this.element<HTMLSelectElement>('frequency-setting').addEventListener('change',event=>action('frequency',(event.target as HTMLSelectElement).value),{signal});
    this.element<HTMLInputElement>('effects-setting').addEventListener('change',event=>action('effects',(event.target as HTMLInputElement).checked),{signal});
    signal.addEventListener('abort',()=>{this.input.clear();setFocus(game,false);},{once:true});
  }
  private element<T extends HTMLElement>(id:string):T { const element=document.getElementById(id);if(!element)throw new Error(`Missing game control: ${id}`);return element as T; }
  private button(id:string):HTMLButtonElement{return this.element<HTMLButtonElement>(id);}
  sync():void {
    const ui=gameUI(this.game), manual=ui.mode==='manual', enabled=this.canPlay();
    this.element('game-controls').hidden=!manual;
    this.button('play-button').disabled=!enabled||manual;
    this.button('demo-button').hidden=manual;
    this.button('demo-button').disabled=!enabled||ui.phase!=='rest';
    this.scene.dataset.mode=ui.mode;
    this.scene.tabIndex=manual?0:-1;
    this.scene.setAttribute('aria-label',manual?'DeepSeekちゃんファイターズ。WASDか矢印で移動、Jで攻撃、Kで回避、Lで必殺技、Escでポーズ。':'夕凪の書斎');
    this.element('game-health').textContent=`HP ${ui.hp} / 5　夕凪 ${ui.gauge} / 100`;
    const result=ui.phase==='result'||ui.phase==='retry';
    this.button('game-retry').hidden=!result;
    this.button('game-pause').textContent=ui.paused?'再開 Esc':'ポーズ Esc';
    for(const name of ['attack','dodge','special'])this.button(`game-${name}`).disabled=!enabled||ui.paused||result||(name==='special'&&!ui.specialReady)||(name==='dodge'&&!ui.dodgeReady);
    this.element('game-instruction').textContent=result?PHASE_NAMES[ui.phase]:!enabled?'動きが停止中です。既存の再開・静止設定をご確認ください。':'WASD / 矢印で移動 · J/Z 攻撃 · K/X 回避 · L/C 必殺';
    const announcement=`${ui.mode}:${ui.phase}:${ui.paused}`;
    if(this.lastAnnouncement!==announcement){this.element('game-announcement').textContent=manual?`手動プレイ。${PHASE_NAMES[ui.phase]}${ui.paused?'。ポーズ中':''}`:'';this.lastAnnouncement=announcement;}
    this.element('scene-thought').textContent=ui.phase==='rest'?'ただ、ここにいる。':PHASE_NAMES[ui.phase];
    if(!enabled){this.input.clear();setFocus(this.game,false);}
    document.documentElement.dataset.gameMode=ui.mode;
  }
  release():void {this.input.clear();setFocus(this.game,false);}
}
