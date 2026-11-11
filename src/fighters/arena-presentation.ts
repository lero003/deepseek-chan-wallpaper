import type { FightersGame, GameUI } from './types.ts';
import { ARENA, ARENA_ROUNDS, BOSS } from './definitions.ts';
import { Painter } from './art-kit.ts';
import { C, drawCombo, drawGauge, drawHeart } from './art.ts';

export function arenaInstruction(ui: GameUI): string {
  if (ui.phase === 'result') return '3連戦を終えました。もう一戦するか、静かな書斎へ。';
  if (ui.phase === 'retry') return ui.arcade.timedOut
    ? 'TIME UP。このラウンドから再挑戦できます。失敗したラウンドの得点は巻き戻します。'
    : 'このラウンドから再挑戦できます。失敗したラウンドの得点は巻き戻します。';
  if (ui.paused) return 'ひと休み中。Esc または「再開」で戻れます。';
  if (ui.phase === 'intro' || ui.phase === 'bossIntro') return '開戦準備中。合図のあとに操作できます。';
  if (ui.phase === 'roundClear') return 'ラウンドクリア。ひと息ついたら、次の相手へ。';
  if (ui.phase === 'victory' || ui.phase === 'return') return '決着。静かな書斎へ帰ります。';
  return 'WASD / 矢印で間合いを調整 · J/Z 3段攻撃 · K/X 回避 · L/C 必殺';
}

const points = (score: number): string => score.toString().padStart(6, '0');

/** Arena-only framing. The passive wallpaper never calls this painter. */
export function drawArenaHud(p: Painter, game: FightersGame, ui: GameUI): void {
  const hero = game.hero;
  const boss = game.enemies.find(enemy => enemy.kind === 'boss');
  const bossRound = Boolean(ARENA_ROUNDS[game.section]?.boss) || game.bossSpawned;
  const fighting = game.phase === 'battle' || game.phase === 'boss';
  p.screen(8, 8, 153, 30, C.ink, .88);
  p.screen(9, 9, 2, 28, C.gold, .85);
  p.screenText(17, 13, 'DeepSeekちゃん', C.paper, 7);
  for (let i = 0; i < 5; i++) drawHeart(p, 17 + i * 11, 25, i < hero.hp);
  p.screenText(79, 25, `SCORE ${points(ui.arcade.score)}`, C.paperShade, 6, .95);

  p.screen(197, 8, 86, 30, C.ink, .88);
  p.screenTextCentered(240, 13, `ROUND ${ui.round} / ${ui.rounds}`, C.goldLight, 7);
  p.screenTextCentered(240, 25, `TIME ${ui.arcade.secondsLeft.toString().padStart(2, '0')}`,
    ui.arcade.secondsLeft <= 15 ? C.danger : C.paper, 7, .95);

  p.screen(319, 8, 153, 30, C.ink, .88);
  p.screen(469, 9, 2, 28, C.gold, .85);
  p.screenText(327, 13, bossRound ? BOSS.name : ui.roundLabel, C.paper, 7);
  if (bossRound) {
    const ratio = boss ? Math.max(0, boss.hp / boss.maxHP) : game.outcome === 'win' ? 0 : 1;
    p.screen(327, 26, 135, 5, '#64515a');
    p.screen(327, 26, 135 * ratio, 5, ratio <= .3 ? C.rose : C.gold);
    p.screen(327, 26, 135 * ratio, 1, C.goldLight, .9);
  } else {
    p.screenText(327, 26, game.phase === 'intro' ? '雑魚戦 · 開戦準備' : game.phase === 'roundClear'
      ? 'ラウンドクリア' : `雑魚戦 · 残り ${ui.enemies} 体`, C.paperShade, 6, .9);
  }
  drawCombo(p, hero.hitCombo, game.tick);
  if (ui.arcade.multiplier > 1 && fighting) p.screenText(15, 57, `SCORE ×${ui.arcade.multiplier}`, C.goldLight, 7);
  if (boss?.state === 'windup' && game.phase === 'boss') {
    p.screen(319, 42, 153, 14, C.ink, .9);
    p.screenText(327, 46, BOSS.patterns[boss.pattern % BOSS.patterns.length]!, C.goldLight, 7);
  }

  p.screen(8, 242, 464, 21, C.ink, .82);
  p.screenText(15, 246, '夕凪', C.goldLight, 6);
  drawGauge(p, 44, 248, hero.gauge, hero.gauge >= 100, .6);
  p.screenText(161, 249, !fighting ? (game.phase === 'victory' || game.phase === 'return'
    ? '決着。静かな書斎へ帰ります。' : 'ひと息ついて、開戦の合図を待とう')
    : hero.gauge >= 100 ? 'L / C  必殺できます' : '攻撃を当てて必殺ゲージをためる', C.paper, 6, .9);
  p.screenText(365, 249, !fighting ? '攻撃はお休み' : ui.dodgeReady ? 'K / X  回避 OK' : '回避を準備中', C.paperShade, 6, .9);

  const phase = game.phase;
  if (phase === 'intro' || phase === 'bossIntro') {
    const duration = phase === 'bossIntro' ? ARENA.bossIntroTicks : ARENA.introTicks;
    const alpha = Math.min(1, game.phaseAge / 12, (duration - game.phaseAge) / 12);
    const opponent = bossRound ? BOSS.name : ui.roundLabel;
    band(p, phase === 'bossIntro' ? 'FINAL ROUND / RIVAL' : `ROUND ${ui.round} / SKIRMISH`,
      bossRound ? `${BOSS.title}　${opponent}` : opponent, 'READY · J/Z 攻撃　K/X 回避　L/C 必殺', alpha);
  } else if (phase === 'roundClear') {
    const next = ARENA_ROUNDS[game.section + 1];
    band(p, `ROUND ${ui.round} CLEAR   +${ui.arcade.lastRoundBonus}`,
      ui.arcade.perfect ? 'ノーダメージで突破。' : 'ひと息ついて、次の相手へ。',
      next?.boss ? `NEXT　${BOSS.name}との一騎打ち` : `NEXT　${next?.label ?? '決着'}`, 1);
  } else if (phase === 'victory') {
    band(p, `BOUT COMPLETE   RANK ${ui.arcade.rank}`, '決着。お茶にしましょう。',
      `SCORE ${points(ui.arcade.score)}　最後のクリア +${ui.arcade.lastRoundBonus}`, Math.min(1, game.phaseAge / 15));
  } else if (fighting && game.phaseAge < 36) {
    band(p, `ROUND ${ui.round} / START`, 'FIGHT', '間合いを合わせて、3段コンボ。', 1 - game.phaseAge / 36);
  }
}

function band(p: Painter, eyebrow: string, title: string, subtitle: string, alpha: number): void {
  p.screen(42, 59, 396, 57, C.ink, alpha * .93);
  p.screen(42, 59, 3, 57, C.gold, alpha);
  p.screenText(56, 68, eyebrow, C.goldLight, 6, alpha);
  p.screenText(56, 81, title, C.paper, 11, alpha);
  p.screenText(56, 102, subtitle, C.paperShade, 6, alpha * .9);
}
