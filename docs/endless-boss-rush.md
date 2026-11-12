# 無限ボスラッシュ / DSH接続契約

2026-11-12、壁紙側Part Aを実装。Webの「無限ボスラッシュ」で自動操縦の1対1を繰り返す。雑魚・90秒制限・採点・勝敗リザルトはなく、ダウンしても次の相手へ進む。「書斎へ戻る」で終了する。

手動3連戦・自動小競り合い・Macの受動壁紙は従来のまま。新モードを保存設定や自動イベントに登録しない。Macに新しい入口は追加していない。

## ボスと背景

定義・HP・肩書き・パレット・atlasキー・攻撃調整は[definitions.ts](<../src/fighters/definitions.ts>)に集約。

| ボスID | 表示名 / 肩書き | 基準HP | 素材 |
| --- | --- | --- | --- |
| `lumie` | 綴星リュミエ / 琥珀の思考家 | 30 | 既存のローカル8姿勢。未提供・不正なら従来のコード描画 |
| `shio` | 汐見のリツカ / 潮読みの剣士（仮） | 24 | 青緑のパレット・短剣のコード描画。画像なし |
| `yume` | 紙灯のユメ / 夜想の装丁師（仮） | 36 | 紫のパレット・紙灯のコード描画。画像なし |

| ステージID | 表示名 | 素材 |
| --- | --- | --- |
| `terrace` | 夕凪のテラス | 既存のローカル背景。なければコード描画 |
| `terrace-night` | 月夜のテラス | 月・星・冷色の海のコード描画 |
| `terrace-rain` | 雨音のテラス | 雲・雨筋・青灰色の海のコード描画（無音） |
| `pier-dawn` | 朝凪の桟橋 | 朝日・木の桟橋のコード描画 |

追加PNG・画像生成・第三者ファイルはない。承認済み生活16コマ、背景3種・マット、既存戦闘画像のbyteは変更していない。新しい案も個人用試作で、公開・再配布の許諾やライセンス追加ではない。

ボス・背景は別々のseed付きシャッフルバッグで選び、直前との重複を避ける。ボスのバッグ更新ごとに周回+1。HPは`min(baseHP * 2, baseHP + (cycle - 1) * 4)`。対面100/110/130ticks、撃破・ダウン後の安全な`interlude`は60ticks。各対戦の開始時にHP5・ゲージ0へ戻す。カメラは960固定。単一ロスターのバッグも停止しない。

## プラグインAPI（追加のみ）

```ts
import { createGame, advanceGame, command, gameUI } from '../src/fighters/game.ts';
import { gamePlan } from '../src/fighters/render-plan.ts';

const game = createGame(seed, scene);
command(game, 'endless'); // 再送はno-op。必ず安全なbossIntroから開始
advanceGame(game, deltaSeconds);
const status = gameUI(game).endless; // inactiveならnull
const plan = gamePlan(game, atlas, appearance, true, 'wallpaper', motes);
renderer.drawPlan(plan);
// 作業終了後のsettleを終えたら
command(game, 'home'); // endless=null、mode=auto、phase=rest
```

- `mode`と`route`は`endless`。`bossIntro → boss → interlude → bossIntro`のみを巡回し、`outcome`は`none`。`play`/`demo`/`retry`/手動入力は割り込まない。
- `gameUI(game).endless`は`active/cycle/defeated/downs/bossId/bossName/bossTitle/bossHP/bossMaxHP/stageId/stageLabel/phaseLabel`を提供。`stats.wins`は撃破ごとに+1、`stats.episodes`は開始ごとに+1。ダウンは`downs`に記録する。
- `gamePlan(..., 'wallpaper')`のendlessは、`battle.arena=true`・`battle.stageId`付きの戦闘を描き、HUD・章題・結果パネルを描かない。プラグインがDOMのHUDを持つ。`preview`はボス名・HP・撃破・復帰・周回を描く。
- 元指示書§4.6の「endlessも早期return」では静かな書斎になり、§5.3のプラグイン描画契約と矛盾するため、§5.3を採用した。Macは`native-bridge.ts`側でendlessの受動壁紙を静かな生活へ戻す。既存manualの共通描画ガードは維持。
- 既存の`createGame/advanceGame/command/gameUI`の引数は不変。任意の`seedText`追加引数は今回は実装していない。

## 任意素材の追加

ホストは以下を任意に登録できる。全フィールド省略でも動作する。

- `ArtProfile.bossUrls: Partial<Record<BossId, string>>`と`RenderAppearance.bossAtlases`。読込後の画像は`SceneImages.bosses`へ渡す。
- `RenderAppearance.arenaBackdrops: Partial<Record<StageId, string>>`。480×270の読込済み画像は`SceneImages.arenas`へ渡す。
- 従来の`bossUrl/bossAtlas/SceneImages.boss`はリュミエ用に維持。ID未指定の既存sprite命令は従来の経路を使う。新sprite命令には`bossId`が入る。
- 画像寸法とatlasをボス単位で検査し、不正なものだけコード描画へ戻す。ステージ背景も独立に検査。キャッシュはステージID・サイズ変更で更新し、外周は舞台ごとの単色にする。
- 個人用PNGを加える場合はignoredの`private-art/runtime/`に置き、同フォルダーの台帳とローカルプロファイルに記録する。`--mode placeholder`は制作素材をimportしない。新しい外部配信やネットワーク取得は追加しない。

## 検証と手動受け入れ

自動検証の最新結果は[current_status.md](<current_status.md>)。30分相当の決定性・ボスのみ・一度に1体・HP上限・ダウン復帰・時計/採点非稼働・安全区間・HUD分離・独立素材フォールバック・背景キャッシュ・停止復帰を検査する。既存テストの削除・無効化・期待値緩和はしていない。

通常のSafari/Chromeで次を手動確認する（ブラウザー自動化は未実行）。

1. 「無限ボスラッシュ」で対面→戦闘→余韻→別のボス・背景へ進む。
2. 5分以上眺め、クリア・結果・90秒制限が出ず、撃破数が増える。ダウン時も続く。
3. 書斎へ戻り、「対戦を見る」と手動3連戦が従来どおり動く。
4. Reduce Motion・静止表示・タブ非表示・設定ダイアログで停止し、復帰時に時間を一括再生しない。
5. 狭幅・横長・読み上げ・キーボード移動、実Macの壁紙とスリープ、実時間30分のCPU/メモリ/発熱を確認する。

## Part Bの接続（別リポジトリ・実装済み）

元指示書の`DeepSeek-Chan-Fighters-DSH/dsh-fighters`が対象。ユーザーの続行依頼でv0.2.0に接続済み。壁紙側のソース変更だけでは既存プラグインは切り替わらず、プラグイン側のclient再ビルドも実施した。

- **B1-1 runtime**：作業開始時のdemo連鎖をendless開始1回へ変更。restでの再開を除去し、終了時は次の戦闘更新を止めたsettle→home。factsへ`defeated`（wins差分）を追加。
- **B1-2 art**：上記の任意マップへ登録。まず既存の6PNGと新ボス/背景のコード描画で検証できるため、追加画像の同梱は不要。
- **B1-3 UI**：ボス名・肩書き・舞台・撃破・復帰・周回をHUDへ、撃破ボス数・周回を結果へ追加。未計測の扱いを維持。
- **B1-4/5、B2**：store/static-audit/禁止API/Slot ID/6PNG監査、client再ビルド・構文検査・全テスト、README/VERIFICATION更新とDSH実ページの手動受け入れ。

Part B側はコード変更・client生成・Node78テスト・監査まで完了。実DSH/HMRの手動受け入れ・再インストールは未実施。GitHub同期は非公開のソース、個人用Releaseは私有画像を含まないplaceholder版として準備する。一般公開・Pages・npm公開はしない。

## 変更ファイル

- コア：`types.ts`、`definitions.ts`、`factory.ts`、`endless.ts`、`director.ts`、`game.ts`、`enemy-brain.ts`、`combat.ts`。
- 描画：`endless-art.ts`、`boss-art.ts`、`art-kit.ts`、`render-types.ts`、`render-plan.ts`、`render/renderer.ts`、`app-web/art-profile.ts`、Macの受動面ガード`native-bridge.ts`。
- Web：`index.html`、`fighters-ui.ts`、`main.ts`、`style.css`。
- 検証：新規`endless.test.mjs`、`endless-render.test.mjs`、既存のboss-art/fighters-render/fighters-ui/art-profile/static-frameテストを拡張。
- 文書：`AGENTS.md`、`README.md`、`CREDITS.md`、`fighters-mvp.md`、本書、`current_status.md`。依存定義・lockfile・画像・生成素材は変更なし。
