import { command, gameUI, setFocus, setMovement } from '../fighters/game.ts';
import type { FightersGame } from '../fighters/types.ts';
import { arenaInstruction } from '../fighters/arena-presentation.ts';
import { GameInput } from './game-input.ts';

export class FightersUI {
  readonly input: GameInput;
  private lastAnnouncement = '';
  private readonly game: FightersGame;
  private readonly scene: HTMLElement;
  private readonly canPlay: () => boolean;

  constructor(game: FightersGame, scene: HTMLElement, canPlay: () => boolean, changed: () => void, signal: AbortSignal) {
    this.game = game; this.scene = scene; this.canPlay = canPlay;
    const action = (name: string, value?: unknown) => { command(game, name, value); this.sync(); changed(); };
    this.input = new GameInput(scene, {
      active: () => game.mode === 'manual' && canPlay(), movement: (x, y) => setMovement(game, x, y),
      action: name => action(name), pause: () => action('pause'), focus: focused => setFocus(game, focused),
    }, signal);
    const focusScene = () => { scene.focus({ preventScroll: true }); this.input.syncFocus(); changed(); };
    this.button('play-button').addEventListener('click', () => { action('play'); focusScene(); }, { signal });
    this.button('demo-button').addEventListener('click', () => action('demo'), { signal });
    this.button('game-home').addEventListener('click', () => {
      this.input.clear(); action('home'); this.button('play-button').focus({ preventScroll: true });
    }, { signal });
    this.button('game-retry').addEventListener('click', () => { action('retry'); focusScene(); }, { signal });
    for (const name of ['attack', 'dodge', 'special', 'pause']) {
      const button = this.button(`game-${name}`);
      button.addEventListener('pointerdown', event => { if (game.mode === 'manual') event.preventDefault(); }, { signal });
      button.addEventListener('click', () => { focusScene(); action(name); }, { signal });
    }
    this.element<HTMLSelectElement>('frequency-setting').addEventListener('change', event => action('frequency', (event.target as HTMLSelectElement).value), { signal });
    this.element<HTMLInputElement>('effects-setting').addEventListener('change', event => action('effects', (event.target as HTMLInputElement).checked), { signal });
    signal.addEventListener('abort', () => { this.input.clear(); setFocus(game, false); }, { once: true });
  }

  private element<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing game control: ${id}`);
    return element as T;
  }
  private button(id: string): HTMLButtonElement { return this.element<HTMLButtonElement>(id); }

  sync(): void {
    const ui = gameUI(this.game), manual = ui.mode === 'manual', enabled = this.canPlay();
    const result = ui.phase === 'result' || ui.phase === 'retry';
    const fighting = ui.phase === 'battle' || ui.phase === 'boss';
    this.element('game-controls').hidden = !manual;
    this.button('play-button').hidden = manual;
    this.button('play-button').disabled = !enabled || manual;
    this.button('demo-button').hidden = manual;
    this.button('demo-button').disabled = !enabled || ui.phase !== 'rest';
    this.scene.dataset.mode = ui.mode;
    this.scene.tabIndex = manual ? 0 : -1;
    this.scene.setAttribute('aria-label', manual
      ? 'DeepSeekちゃんファイターズ。雑魚戦2回とボスとの3連戦。WASDか矢印で間合いを調整、Jで攻撃、Kで回避、Lで必殺技、Escでポーズ。'
      : '夕凪の書斎');
    this.element('world').setAttribute('aria-label', manual
      ? `海辺のテラス。第${ui.round}ラウンド、${ui.roundLabel}。${ui.phaseLabel}。`
      : '海を望む小さな書斎。青い髪とクジラの尾を持つ女の子が、歩いたり、立ち止まったり、眠ったりしています。');
    this.element('game-round').textContent = `ROUND ${ui.round.toString().padStart(2, '0')} / ${ui.rounds.toString().padStart(2, '0')} · ${ui.roundLabel}`;
    this.element('game-health').textContent = `HP ${ui.hp} / 5　夕凪 ${ui.gauge} / 100　SCORE ${ui.arcade.score}　TIME ${ui.arcade.secondsLeft}`;
    this.button('game-retry').hidden = !result;
    this.button('game-retry').disabled = !enabled;
    this.button('game-retry').textContent = ui.phase === 'retry' ? 'このラウンドを再挑戦' : 'もう一戦';
    this.button('game-pause').textContent = ui.paused ? '再開 Esc' : 'ポーズ Esc';
    this.button('game-pause').disabled = !enabled || result;
    for (const name of ['attack', 'dodge', 'special']) {
      this.button(`game-${name}`).disabled = !enabled || ui.paused || !fighting
        || (name === 'special' && !ui.specialReady) || (name === 'dodge' && !ui.dodgeReady);
    }
    this.element('game-instruction').textContent = !enabled
      ? '動きが停止中です。既存の再開・静止設定をご確認ください。' : arenaInstruction(ui);
    const announcement = `${ui.mode}:${ui.phase}:${ui.round}:${ui.paused}`;
    if (this.lastAnnouncement !== announcement) {
      this.element('game-announcement').textContent = manual
        ? `第${ui.round}ラウンド、${ui.roundLabel}。${ui.phaseLabel}。${ui.paused ? 'ポーズ中。' : ''}${arenaInstruction(ui)}` : '';
      this.lastAnnouncement = announcement;
    }
    this.element('scene-thought').textContent = ui.phase === 'rest'
      ? 'ただ、ここにいる。気分転換に、テラスで3連戦。' : manual ? ui.phaseLabel : 'テラスで自動対戦';
    if (!enabled) { this.input.clear(); setFocus(this.game, false); }
    document.documentElement.dataset.gameMode = ui.mode;
  }
  release(): void { this.input.clear(); setFocus(this.game, false); }
}
