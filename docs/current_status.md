# 現在の状態 / 引き継ぎ

更新: 2026-11-12 · 静かな来客 Build 12・DSH結果改善 v0.3.0 · 無限ボスラッシュPart A/B（非公開Release） · 非公開Web／個人用Mac試作 · 固定アリーナ・アーケード v0.8（Build 9）+ 背景別環境演出・生活微バリエーション + 生成アート + 壁紙の自動対戦 + 戦闘背景の外周を単色フレーム化 + Build 11 個人テスト用リリース

## 最新の状態：静かな来客 / DSH結果改善（2026-11-12）

- **壁紙・プレビュー**：通常待機中に既存3ボスが1人ずつ訪れ、歩く・立ち止まる・帰る。初回75〜105秒、退室後120〜180秒の有効待機時間。戦闘開始・homeで即退室。生活/戦闘とは別の乱数列で、HP・得点・戦績・対戦予定を変えない。自動対戦頻度offでも訪問あり。新画像/依存/保存設定なし。[仕様](quiet-visitors.md)。
- **検証**：`npm run check`は型検査＋Node **227件・skipなし**＋既定5素材byte再現成功。通常/placeholderのWebビルド、`npm run mac:test`と`npm run mac:test -- --local-preview`はSwift **各29件・6 suites成功**。30分相当の15/30/60fps決定性、来客あり/なしで既存生活・戦闘の完全一致、3人の訪問/歩行/退室、戦闘開始時の解除、共有native bridgeを検査。CoreGraphicsの3人の静止出力を確認（実デスクトップ/アニメーション受入ではない）。
- **Mac Build 12**：`npm run mac:build -- --local-preview`と`npm run mac:dmg`成功。ZIP再展開byte比較、移設後・DMG内・コピー後の署名/自己テスト/Fighters自己テスト成功。Apple Silicon/macOS14以上、アドホック署名・未公証。初回previewのみ、壁紙ON/自動起動/元壁紙設定を変えていない。Build11以前のタグは維持。
  - ZIP `private-art/macos-out/20261112115123-162b76da/KujiraWallpaper-Quiet-Visitors-B12-arm64-local-preview.zip`、SHA-256 `0cae70a9c0770c055faba48fc24202403294dc06158005a57e3112f4980dd2a4`
  - DMG `private-art/macos-out/20261112115446-e109ad8b-dmg/KujiraWallpaper-Quiet-Visitors-B12-arm64.dmg`、SHA-256 `35cd63398998f2ed1eaa877bd340d8ce4d8e15cb397965bc99a0636520a589af`
- **DSH v0.3.0**：結果をスクロールできる記録画面へ。撃破/周回/復帰と相手別撃破、折り畳み詳細、実行情報/観測エラー、「書斎へ戻る」「パネルを閉じる」、前回記録再表示を追加。非表示/静止/途中参加/セッション切替/描画失敗を理由別の未計測にし、切替先のエラーを元セッションへ誤帰属しない。結果中のCanvas更新停止。DSH待機室はvisitors=false。Node86件・ビルド・構文・6PNG監査成功。静止HTMLの通常/未計測/エラーをシステムWebKitで確認、実DSH/HMR/入力受入は未実施。
- **残る受入**：実壁紙で来客の見え方/テンポ/他キャラとの重なり、Space/スリープ、実時間負荷、DSHの実行→結果→帰宅/再表示とキーボード操作。新規ブラウザー/Playwrightは導入していない。公開権利pending、両repoは非公開のまま扱う。

## 無限ボスラッシュ / DSH用API（2026-11-12、Part A/B）

- **現在の変更**：Webの「無限ボスラッシュ」から、自動操縦・ボスのみ・一度に1体・時間制限/採点/勝敗結果なしの新モードへ。撃破またはダウン後60ticksの休息→次の相手。HP5・ゲージ0で復帰し、「書斎へ戻る」で終了。ボス/舞台はseed付きの別バッグで重複回避、周回ごとHP+4・基準の2倍まで。
- **ロスター**：`lumie`綴星リュミエ＋`shio`汐見のリツカ＋`yume`紙灯のユメ。舞台は`terrace`夕凪、`terrace-night`月夜、`terrace-rain`雨音、`pier-dawn`朝凪。既存リュミエ/テラスはローカル画像を再利用可、追加2体・3面はコード描画。新画像/依存/lockfile変更なし。既存生活16コマ・背景3種/マット・戦闘素材は不変更。
- **受け口**：`command('endless')`（冪等）/`command('home')`、`gameUI.endless`、ボスごとのURL/atlasとステージ画像の任意マップ。DSH向け`gamePlan(..., 'wallpaper')`は戦闘＋背景・キャラを描きHUDなし。元指示書§4.6の早期return案と§5.3が矛盾するため§5.3を採用し、Macの受動面はnative-bridgeで静かな生活を維持。既存auto/manual・90秒時計の経路は維持。
- **実行済み検証**：`npm run check`（型検査＋Node **221件成功・skipなし**＋既定5素材byte再現）、`npm run build`、placeholderビルド（PNGは既定2点のみ）、`npm run mac:test`と`npm run mac:test -- --local-preview`（Swift **各27件・5 suites成功**）。30分相当・15/30/60fpsでボス/舞台/HP順と最終状態が一致、seed47で90撃破・31周目。単一ロスター、ダウン復帰、安全区間、素材異常の独立フォールバック、背景キャッシュと単色外周、停止復帰を検証。既存テストの削除・無効化・緩和なし。
- **未実施**：Safari/Chromeの手動5分以上スモーク、実Macの可視/壁紙/スリープ確認、実時間30分の負荷、DSH実ページの受け入れ。シミュレーションと描画命令の検査であり、ブラウザーE2E・実機の合格ではない。Playwright/専用ブラウザーは導入・使用していない。
- **Part B**：別フォルダーDSHのv0.2.0も実装済み（endless1回、settle→home、HUD/facts/result、任意artマップ、静止設定切替）。ビルド・構文・Node78件・6PNG監査成功。私有画像を含まないソースを非公開GitHubへ同期し、2PNGのplaceholder版個人用Releaseを発行済み。実DSH/HMR確認は未実施。Macパッケージは作り直しておらず、既存Build 11にこのソース変更が入った意味ではない（当時。現在は上のBuild12に反映）。
- **GitHubの実測**：壁紙ソース`7cdb128`をpushし、[endless-boss-rush-20261112](https://github.com/lero003/deepseek-chan-wallpaper/releases/tag/endless-boss-rush-20261112)をPublished/prereleaseで発行（新しいMacバイナリなし）。DSHは非公開リポジトリを作成・ソースをpush、[v0.2.0](https://github.com/lero003/DeepSeek-Chan-Fighters-DSH/releases/tag/v0.2.0)は`5d0d7d1`からplaceholder ZIPを添付。ZIP SHA-256 `b953e138d5fb98508420b879af1f5460bf5138e95b2a090b406a9f4305922e75`、85,458 bytes。GitHubから再取得してSHA/構文/2PNG byte一致監査/SOURCEを確認。両repoはprivate・Pages=false、private-art/通常clientはGit対象外。既存Build11と公開済みタグは変更していない。
- 詳細なAPI・素材状態・変更ファイル・手動手順：[endless-boss-rush.md](<endless-boss-rush.md>)。

## 戦闘背景の外周を端の引き伸ばしから単色フレームへ（2026-11-12）

ユーザー指摘「戦闘が始まったとき、背景の周りが無理やり引き伸ばしたような感じになる。別の色でベタ塗りにしたほうがよくない？」への対応。

- **変更**: 480×270pxのテラス背景を16:9以外の面に置くとき、Web Canvas／Mac CoreGraphicsとも、左右・上下を**端1px列の引き伸ばし**で埋めるのをやめ、共有レイアウト`arenaFrameColor`（`#2b2233`・濃いプラム）1色でベタ塗りする。背景は原寸のまま中央に置き、ドットの拡大率も従来どおり。
- **対象**: 手動アリーナと壁紙の自動対戦（同じ`arena`バックドロップ）。書斎・壁紙マット・レガシー経路の合成は不変更。承認済みアート（主人公16コマ・背景3種・各マット・テラス・ボス／戦闘シート）はbyte不変。新しい画像・依存・設定は追加していない。
- **共有方法**: `ARENA_FRAME_COLOR`／`SUNSET_LAYOUT.arenaFrameColor`がprepare-macosの`configuration.json`経由でMacの`Layout`へ渡り、両レンダラーが同じ値を使う（Swift側は部分設定向けの同値フォールバックのみ）。
- **テスト追加**: Web（Node・fake canvas）＝外周が全面1回の`fillRect`、背景は480×270を原点(160,40)に1回だけ描画、1pxスライスが存在しないこと、フィールド欠落時の既定色。Mac（CoreGraphics実描画）＝1600×700で周囲ピクセルが`#2b2233`で、どの高さでも同じであること。
- **今回の検証（Leadが実行・合格）**: `npm run check`（型検査＋Node **202件**、skipなし＋既定5素材byte再現）、`npm run build`／`--mode placeholder`成功、`npm run mac:test -- --local-preview`／`npm run mac:test`（Swift **各27件・5 suites**）。ネイティブ書き出しで1600×700・1440×900・3440×1440の余白が単色、960×540（16:9）は全画面で余白なしを目視し、外周ピクセル値も数値確認した。**描画器の出力であり、実ブラウザ／実Macウィンドウの受入ではない。**
- **既存テストの修正**: `tests/dmg.test.mjs`のDMG名期待値がBuild 10改名に追随しておらず`npm run check`が失敗していたため、現行の`Brushup-B11`名へ更新した（機能変更なし）。
- **ビルド／リリース**: この修正を含む**Build 11**をビルドし、GitHubの既存Build 10 Draftを個人テスト用の実リリース（Published／Prerelease・タグ`brushup-build11`）へ差し替えた。DMG/ZIPのSHA-256と検証は下の「GitHubリリース」節。
- **未受け入れ**: Web実ブラウザでの見た目（Playwright等の自動導入はしない方針のため未確認）、実Macウィンドウ／壁紙ON中の自動対戦での見え方、フレーム色の好みはユーザー確認待ち。色を変える場合は`ARENA_FRAME_COLOR`（[scene-profiles](<../src/art/scene-profiles.ts>)）と[ScenePainter](<../src/app-mac/Core/ScenePainter.swift>)のフォールバックの2箇所。

## アプリ・ブラッシュアップ B01〜B05 実装済み（2026-11-12）

[指示書](<app-brushup-brief.md>)ベースで「おっとり。ときどき、つよい。」を軸に実装。**A01（追加4ポーズ）は画像生成が不可のためスルー**（下記）。承認済み生活16コマ・背景3種・各マット・ボス/テラス/戦闘シートは**byte不変（private runtime 17点のSHA-256一致を確認）**。新規依存・音・AI/API・通知・新保存設定なし。壁紙ONはテスト中含め未実施。

- **B01 文言・背景選択整合**: Web背景selectに標準0（夕凪の書斎）を先頭追加＋読込成功variantsのみ・初期選択＝実描画・標準のみは静的ラベル・Aboutからシーン下へ移動・`#scene-name`同期。「事件を見る」→「対戦を見る」、ゲーム帰宅「壁紙へ戻る」→「書斎へ戻る」（壁紙ON/OFFとは別操作・Web/Mac/シーン内テキスト/同梱README/README/macos.md統一）。「雨音」は背景名維持＋無音注記・背景別生活リズムを説明。
- **B02 導線・停止理由**: Webフッター＝背景／呼んでみる／一時停止＋二次に対戦を見る/テラスで3連戦・タグライン・非公式注記。Macツールバー＝タイトル(タグライン)／背景／一時停止／壁紙／設定／作品について（省電力・エフェクト・頻度は設定NSMenuへ・既存5保存キーのみ）。停止理由は単一理由＋再開導線（Web `stopNote()`／Mac `policy.status`）。`shouldAnimate`/`shouldPaintFrame`/壁紙安全ロジックは無変更。
- **B03 呼びかけ（プレビュー限定）**: 共有コア [`src/companion/companion.ts`](<../src/companion/companion.ts>)。`command 'call'`/`'cancelCall'`、`gameUI.callReady/callReason/companionLine`。auto+rest+idle時のみ受付・20秒クールダウン・1回1反応・RNG/世界/対戦予定を不変更。約1.2秒だけ承認済み正面フレーム(`turn.frames[1]`)を上書き（**新規画像なし**）・台詞はシーン外。壁紙presentationはcueを無視し**描画コマンドはcue有無でbyte一致**（テストで固定）。停止/背景切替/preview閉鎖で`cancelCall`。
- **B04 生活・帰宅キャプション**: `companionLine`＝呼びかけ＞帰宅（「ふう。書斎がいちばん。」/「ひと休みしよう。」）＞自動対戦＞生活観察文（state/mood決定・turnはidleに畳み込みちらつき防止）。Web `#scene-thought`／Mac modeLabelが共有行を表示・停止理由が優先・非live。常時の3連戦勧誘文を廃止。
- **B05 アプリの顔**: Web Aboutに正面フレームcanvas（nearest整数1x）／Mac AboutにNSImageView（2x nearest）。いずれも既存シート再利用・欠落時graceful・placeholder対応・private importなし。Dockアイコンは別スコープのため未着手。
- **A01 スルー**: codex CLI委譲はローカルbackend(127.0.0.1:4202)到達不可、imagegenは現モデルが画像入力非対応。参照なし生成はidentity漂移リスク＋目視検証不能のため統合せず。経緯は [generation-report](<../private-art/qa/brushup/companion/generation-report.txt>)。追加4ポーズは画像生成＋目視承認が可能な環境で別途。

### 今回の検証（すべてLeadが実行・合格）

- `npm run typecheck`／Node **200件**（companion +8・Web call/caption +2、skipなし）／`npm run assets:check`（既定5素材byte再現）。
- `npm run build`（local）／`npm run build -- --mode placeholder` 成功。placeholderバンドルにprivate素材参照なし。
- `npm run mac:test -- --local-preview`／`npm run mac:test`：**各26件・5 suites**合格（private素材SHA検証・30分V8一致・36障害フォールバック含む）。
- private runtime art **17点のSHA-256が台帳と一致**（承認アート保全）。`git diff --check` クリーン。`package.json`/lockfile不変（依存追加なし）。
- 担当: 共有コア+B01文言整合=Lead、Web UI=web-ui、Mac AppKit UI=mac-ui（両者とも範囲内のみ編集・ Leadが全差分レビュー）。

### 未受け入れ（実機・目視はユーザー）

- 実ブラウザ／実Macでのレイアウト（Web 360/768/1440px・200%拡大、Mac 720×470pt最小）・VoiceOver/Tab巡回・フォーカス復帰。
- 呼びかけの反応タイミング（1.2sポーズ/3s台詞）・About顔・背景切替・設定メニューの実表示。
- 壁紙ON/OFF・Space・スリープ・実時間30分のCPU/メモリ/発熱（従来項目も引き続き未完了）。
- 既知の軽微: Mac設定NSMenuは開いている間も再生継続（既存ステータスメニューと同じ・AboutアラートはmodalOpenで停止）。呼びかけのフォーカス喪失単独cancelは未追加（occluded→!runningで実質破棄＋コアが3秒/非idleで自動破棄）。

## 壁紙の自動イベントを「書斎の小事件」から「テラスの自動対戦」へ変更（2026-11-12）

ユーザー指示「壁紙にするときのアクションも小事件ではなく、対戦が途中で始まる方が嬉しい。自動操縦の格闘シーンが見たい」による変更。旧・書斎内の小事件は内部回帰用として残し、通常の自動導線は使わない。

- **開始**: 休憩タイマー到来で`startWallpaperBout`（[director](<../src/fighters/director.ts>)）。READYカードを出さず**すでに戦いの途中**から始まる（ヒロインHP3・ゲージ62・攻撃モーション、敵2体が交戦中）。
- **見せ場**: 約0.9秒間隔で最大3体まで増援。両種(スライム／ポップアップ)・全バリエーションが出現し、**実測で合計31秒前後**（戦闘26秒＋決着・帰宅）。その後は静かな書斎へ戻り、通常の休憩間隔（低=3〜5分／通常=1.5〜2.5分）を空ける。
- **境界**: カメラ960固定・増援は右端から・ボスなし・HUD/章題/READYなし・得点/アーケード時計なし・入力は自動操縦のみ。壁紙はクリア透過のまま。`frequency=off`は対戦なし。
- **アート**: 手動アリーナと同じ生成テラス背景と2026-11-11の新3シートを使う。書斎背景3種・マット・承認済み16コマは不変。画像なし／不正時はコード描画テラスへ戻る。
- **副次修正**: アリーナ経路が自動操縦(`autoIntent`)を呼んでおらず、自動モードでは一切攻撃できなかった問題を修正（[game](<../src/fighters/game.ts>)）。
- **テスト**: 旧・小事件前提の6件を新仕様へ書き換え、[fighters](<../tests/fighters.test.mjs>)・[render](<../tests/render.test.mjs>)・[fighters-render](<../tests/fighters-render.test.mjs>)・[arena](<../tests/arena.test.mjs>)を更新。壁紙presentationがテラスを全画面描画しtextコマンドを持たないことを追加検証。Node190件・Swift26件（両profile）成功。
- **目視**: [壁紙presentationの自動対戦](<../private-art/qa/brushup/native-combat/wallpaper-bout.png>)をCoreGraphicsで書き出し、全画面テラス・HUD/章題なし・両者が描画されることを確認。
- **未受け入れ**: 実機で壁紙ONにしたまま自動対戦が自然に見えるか（増援のテンポ・カメラ切替・他アプリ操作中）、実時間30分のCPU／メモリ／発熱はユーザー確認。

## アートブラッシュアップ（2）— 3施策の制作・統合・自動検証完了

- [計画書](<art-brushup-plan.md>)のテラスA案に続き、**主人公戦闘コマ・雑魚2種も統合済み**。ユーザーの「施策の承認はスキップして、完成まで」の指示により、追加デザイン承認待ちは解消。公開権利・実機受け入れまで承認済みとする意味ではない。
- **主人公**: 基準絵＋元の16コマを参照した8キー姿勢。別シート160×128セル・足元80/124、通常立ち姿は約104px。予備／有効／回復時間に対応し、武器の二重描画を抑制。歩行・生活・帰還は元のコマ。完全な手描き連番アニメーションではない。[処理／生成参照SHA](<../private-art/production/fighters/combat-processing-report.json>)。
- **雑魚**: スライム／ポップアップの2種のまま、待機・移動・予備・攻撃・被弾・退場×normal/fast/tough。各96×64セル・足元48/60、既存の色／大きさ比を整数ピクセルに焼き込む。当たり判定・タイミング・バランス・スコア／時計は不変。
- **境界と失敗時**: 手動アリーナと壁紙の自動対戦に適用。旧・書斎内の小事件・legacyのコマンドは従来と同一。3シートそれぞれが元の体＋小物まで含む独立フォールバックを持ち、別シートや主人公へ誤代替しない。Mac背景は設定の存在ではなく実読込の成功で`arenaArt`を決め、失敗時はコード描画の環境演出も復元する。
- **保全**: 元の11アセット（承認済み8ファイル＋ボス2＋テラス）はSHA不変。新3シートは二値alpha・共有80色・透明余白・接地を確認。placeholderは制作シート／テラスをimport・同梱しない。ローカル専用・許諾pending・無音・依存追加なし・Playwrightなしを維持。
- **確認範囲**: 原寸／3xとネイティブ静止画はLeadが目視。Node190件・Swift26件（両profile）・Web／placeholder／Macビルド成功。可視キー操作・連続動作・壁紙ON/OFF・Space／スリープ・実時間30分負荷は未受け入れのまま。詳細と成果物は以下。

## 今回の変更（ブラッシュアップ A：背景別の環境演出と生活の微小バリエーション）

承認済みアート（主人公16コマ・背景3種・マット）は1pxも変更せず、コードのみで磨いた。Build 9のソースは先にローカルcommit済み（`2b3171b`、pushはしていない）。

- **背景別の環境演出**：[ambience](<../src/render/ambience.ts>)に背景プロフィールを追加。夕凪は承認済みの暖色・小鳥のまま（プロフィール無しとbyte一致をテストで固定）。月夜は冷色の光粒・海面きらめき、小鳥なし、upper paneをゆっくり横切る流れ星（約7分に1度・1.8秒）、ランプ明滅をわずかに増量。雨音は窓の2パネル内を落ちる雨筋（横框・縦框を跨がない／描かない）、水面の波紋、小鳥なし。すべて矩形コマンドでCanvasとCoreGraphicsが共有。
- **生活の微小バリエーション**：[world](<../src/world/world.ts>)に「窓辺の景観スポットまで歩いて長く佇む」gaze（45秒クールダウン）と背景連動リズム（月夜は眠りやすい・雨音は窓辺で過ごしやすく）を追加。[scene-plan](<../src/render/scene-plan.ts>)に睡眠中の小さな泡。新規コマ・新規画像なし、seed付き遷移のみで決定性を維持。
- **配線**：[art-profile](<../src/app-web/art-profile.ts>)に`VariantAppearance`と`resolveAppearance`、[renderer](<../src/render/renderer.ts>)に`activeAppearance`。Webは背景切替でappearanceとmoodを追従。Macは[native-bridge](<../src/app-mac/native-bridge.ts>)の`setVariantJSON`→[ScenePainter.selectVariant](<../src/app-mac/Core/ScenePainter.swift>)が共有コアのappearance/moodを同期。[prepare-macos](<../scripts/prepare-macos.mjs>)とローカル`variants.json`がappearanceを搬送。
- 戦闘（アリーナ）は固定テラスで背景選択の影響を受けない。壁紙の自動対戦・レガシールートは従来どおり得点も時計も持たない。

## 以前の変更（2回のアーケード点検と改善）

- **1回目：点検で見つけた弱点**：開戦の合図が実際に描かれておらず「合図を待つ」表示だけだった／得点・評価・制限時間がなく、うまくなる目標がなかった／生の命中数をそのまま得点にするとリトライで稼げた。
- **1回目：改善**：各ラウンド90秒のアーケード時計、命中（実ダメージ×25×コンボ倍率、5コンボごとに最大4倍）、KO（雑魚100／ボス1000）、クリア時の残り秒・残HP・ノーダメージ・ボーナス、S/A/B/CのRANK、CONTINUE回数を追加。開戦はREADY→FIGHT、HUDにSCORE/TIME、結果にRANK/SCORE/最大コンボ/CONTINUEを表示。失敗ラウンドの得点はクリア済みチェックポイントへ巻き戻し、CONTINUEだけ残すのでリトライ稼ぎにならない。得点は診断用の生統計（runStats）から分離した。
- **2回目：点検で見つけた弱点**：方向入力と攻撃を同じtickに入れると、押した方向へ振り向かず逆向きに空振りした（P1）／ボスの突進は技名だけで、どこへ突っ込むかの床の手掛かりがなかった。
- **2回目：改善**：攻撃開始前にそのtickの方向入力を反映するよう修正。突進（思索のステップ）の予備動作中、床に進行方向の警告ラインを表示。どちらも回帰テストを追加した。
- 壁紙の自動対戦・承認済み16コマ・背景3種・レガシールートには、得点も時計も影響しないことをテストで固定。

## 現在の実装

- **手動の入口は固定アリーナ**：「テラスで3連戦」。カメラ960固定、徒歩での区間解放なし。第1ラウンド3体 → 第2ラウンド4体 → 綴星リュミエ1体との一騎打ち。雑魚は従来のスライム／ポップアップのみ、ボス枠も1体のみ。
- **開始と区切り**：開戦準備（READY）→ 戦闘（FIGHT）→ 安全な休息／HP+1 → 次へ。ボス対面中は描画だけ。開始・休息中は攻撃・被弾・敵弾更新を止める。
- **時計と得点**：開戦準備・休息・ポーズ・フォーカス喪失中は減らない。命中はヒットストップを含む。90秒でTIME UP、敗北と同じ再挑戦へ。得点は実効ダメージのみ（オーバーキルや死体への追撃は加算しない）。
- **新ボス制作案**：綴星リュミエ／琥珀の思考家。Claudeの文章・思考を着想にしたオリジナル案で、公式キャラ／Anthropic社の提携・承認ではない。96×112px×8姿勢、シート384×224px、足元48/108、共有80色、alpha0/255。生成原本・加工・レビュー・本番素材はGit対象外。画像なし／読込失敗は両レンダラーが共通の簡易美少女描画へ戻る。
- **Web／Mac導線**：HUDのROUND/TIME/SCORE、結果のRANK/CONTINUE、開始・終了中の攻撃ボタン無効、状態別の再挑戦／もう一戦。Web読み上げはラウンド／フェーズ単位。帰宅フェードは静かな部屋へ切り替え、結果紙は主人公の顔を隠さない。

## 壁紙・承認済み素材の保全

- 普段は静かな生活。自動イベントと「対戦を見る」はテラスでの自動対戦（カメラ960固定、HUD・章題・ボスなし、途中から開始）。手動対戦中の受動的な壁紙面も静かな生活のまま。旧4エリア・12区間と旧・書斎内の小事件は内部回帰テスト用。
- 承認済み主人公80×112px・16コマ、夕凪／月夜／雨音の背景と各マットの8ファイルはSHA-256不変。1024×576マット中央の480×270は各原画とbyte一致、壁紙の整数倍率2倍以上・環境演出も維持。
- 保存設定は一時停止・省電力・自動対戦の頻度・エフェクト量・背景の5つだけ。戦闘進行・スコア・キー・壁紙ONは保存しない。非表示／Reduce Motion／セッション／スリープ停止を弱めていない。
- AppKit／CoreGraphics／JavaScriptCoreと共有TypeScriptを維持。新しい依存・専用ブラウザー・音・通信・AI/API・分析・通知・自動起動は追加していない。壁紙ON／元壁紙の設定変更もビルド・テストでは行っていない。

## 以前の検証（無限モード以前）

- `npm run check`（`build`／Macビルドからも実行）：型検査・**Node185テスト**（+26、skipなし）・既定5素材のbyte再現性に成功。`npm run build`と`--mode placeholder`のViteビルド成功。placeholderのPNGは既定2点のみで、新3シート・ボス・テラス・制作背景／マットを含めない。
- 新規テスト（環境演出A）：夕凪ambienceのbyte一致、月夜の冷色・流れ星、雨の2パネル内落下・波紋・140quad予算、gaze・背景別リズム・mood決定性、睡眠バブル、`resolveAppearance`、native-bridgeの`setVariantJSON`。
- 新規テスト（アリーナ背景）：`battle.arena`フラグ（壁紙/ルーム/legacyは非設定）、生成絵使用中のscenery ambienceスキップとフォールバック維持、480×270検証と不正サイズのフォールバック、viewportサイズ描画（3600pxステージでない）、壁紙への非漏洩。
- 得点・90秒・TIME UP・リトライ巻き戻し・CONTINUE・コンボ倍率・ランク、同tick方向＋攻撃、突進の床予告、壁紙／ルーム／レガシーへの非影響、15/30/60fpsの30分決定性をテスト。
- `npm run mac:test -- --local-preview`／`npm run mac:test`：Swift Testing **各25件成功**（+3）。生活／自動ゲームの30分V8一致、開始・停止時計、入力ボット3連戦、帰宅、SCORE/RANK、背景切替を維持。local-previewでは44姿勢／variantのネイティブ描画、3シート×12障害（欠落・SHA・PNG破損・寸法・設定atlas・ファイルatlas・設定entry＋設定atlasのnull／文字列／数値／bool／配列）で独立フォールバックと展開後ピクセル完全一致を確認。設定atlasを辞書に限定し、FoundationのJSON書き出し例外で起動が落ちる経路も防いだ。placeholderでは制作アートなしの従来経路を確認。
- 独立レビュー担当が描画／失敗時の境界を点検し、Node回帰25件を実装。Leadがシート部分セットの回帰1件を追加して[新規Node回帰は計26件](<../tests/combat-art.test.mjs>)。Leadは全差分をレビューしてWeb・Swift・アーカイブの検証を直接実行した。新規Swiftの詳細は[CombatArtTests](<../tests/native/CombatArtTests.swift>)。
- ボス8姿勢と新44姿勢の接地・透過・台帳SHA、既存素材hash不変を確認。新アートの適用前後で書斎・legacy・受動壁紙の描画コマンドはbyte同一。
- 新演出のネイティブ描画QA：睡眠バブル・流れ星・雨筋を`--render-preview`で書き出し、 blended ピクセルを数値確認（流れ星は予測位置と一致）。**描画器の出力であり、可視アニメーションの合格ではない。**

## ローカルMac成果物（Build 11 = 個人テスト用リリース）

- `npm run mac:build -- --local-preview` 成功（`CFBundleVersion 11`・`bundleBuild 11`）。`npm run mac:dmg` でDMGを作成し、読み取り専用マウント・署名検証・イメージ内／コピー後の`--self-test`／`--fighters-self-test`に成功。アドホック署名＋Hardened Runtimeで、Developer ID署名・公証ではない。
- [アプリ](<../private-art/macos-out/20261112081226-a8e7ec76/くじらの散歩道.app>) / [ZIP](<../private-art/macos-out/20261112081226-a8e7ec76/KujiraWallpaper-Brushup-B11-arm64-local-preview.zip>)（3,094,343 bytes）
  - ZIP SHA-256 `695d051ab9e304b4744622f86741897c350431a90154a7e83d274b5713f93790`
- [DMG](<../private-art/macos-out/20261112085125-aae58e45-dmg/KujiraWallpaper-Brushup-B11-arm64.dmg>)（3,938,573 bytes・読み取り専用マウント検証済み）
  - DMG SHA-256 `ca9a8a66d02f81d4b7356cdae16b1e8aae05841b988fba95a1509c3ff392b69c`
  - [DMGレポート](<../private-art/macos-out/20261112085125-aae58e45-dmg/dmg-report.json>)／[リリース用コピー](<../private-art/macos-out/release-b11/>)
- DMGの作成・マウントはこのセッションのファイルサンドボックス（workspace-write）では`hdiutil`が拒否されたため、ユーザー承認のうえ、そのコマンドだけフルアクセスで実行した。ビルド内容・検証項目は従来と同じ。
- ビルド時のネイティブPNG（プレビュー・背景3種・戦闘・ボス・各フェーズ）を生成。**描画器の出力であり、実デスクトップのスクリーンショット・可視キー操作の合格ではない。**

## 旧ローカルMac成果物（Build 10 = ブラッシュアップ B01〜B05）

- `npm run mac:build -- --local-preview` 成功（`CFBundleVersion 10`）。アドホック署名＋Hardened Runtime、ZIP再展開の全ファイルbyte一致・移設後の最小PATHでの自己検証／Fighters検証に成功。Developer ID署名・公証ではない。
- [アプリ](<../private-art/macos-out/20261111221723-f55741f8/くじらの散歩道.app>) / [ZIP](<../private-art/macos-out/20261111221723-f55741f8/KujiraWallpaper-Brushup-B10-arm64-local-preview.zip>)（3,094,476 bytes）
  - ZIP SHA-256 `5ae0d0dc6de744495735cd325347414bbe68d9f7d58541bee6a04a8488fccc9a`
- [DMG](<../private-art/macos-out/20261111221736-9b4609d1-dmg/KujiraWallpaper-Brushup-B10-draft-arm64.dmg>)（3,954,682 bytes・読み取り専用マウント検証済み）
  - DMG SHA-256 `4c0a5b9495f0b3fc11152b73c86ebf45a15b8867014de8eb61eb6eca1567854f`
  - [ローカル台帳](<../private-art/macos-out/latest.json>)／[DMGレポート](<../private-art/macos-out/20261111221736-9b4609d1-dmg/dmg-report.json>)
- 今回の描画QAはビルド時のネイティブPNG（プレビュー・背景3種・戦闘・ボス・各フェーズ）。**ネイティブ描画器の出力であり、実デスクトップのスクリーンショット・可視キー操作・連続アニメーションの合格ではない。**

## GitHub同期（2026-11-12・ユーザー明示依頼）

- 1回目「github含めて更新しておいてほしい」: B01〜B05 のソースを非公開リポジトリ `lero003/deepseek-chan-wallpaper` の `main` へ commit・push（`2abe895`、続くdocs更新 `9b6f587`）。PRIVATEのまま。
- 2回目「Draft差し替えもお願い。他のマシンでも動かしたい」: Build 10 をローカルでビルド・検証し、既存Draftリリースを **Build 10 の内容へ差し替え**（タイトル／本文／タグ名 `brushup-build10`／添付）。詳細は下節。
- 3回目「基本は良いと思う！pushしておいて」: 戦闘背景の外周を単色フレームへ変えた `9f98f03` を `main` へ push し、ローカルと `origin/main` の一致を `git ls-remote` で確認。Draftリリース・可視性・Pagesは未変更。
- 4回目「GitHubリリースのところ書いておいてほしい…実リリース書いちゃっていいかも」: Build 11を再ビルドしてDMG/ZIPを検証し、Build 10 Draftを実リリース`brushup-build11`へ差し替え・公開した（PRIVATEのまま。詳細は下節）。ビルド番号・リリースノート・DMG試用ガイドの更新も`main`へpush。
- 同期対象はコード・テスト・ドキュメントのみ。`private-art/`（生成素材・マスター・QA画像・Mac成果物）、`dist/`、`habitat-report/`、`node_modules/` は従来どおりGit対象外で、force-add していない。
- 可視性変更・Pages・一般公開は行っていない（リポジトリはPRIVATE）。`brushup-build11`のタグとリリースは非公開リポジトリ内にのみ存在し、外部からは見えない。

## GitHubリリース（Build 11・個人テスト用の実リリース、2026-11-12）

- [Release `brushup-build11`](<https://github.com/lero003/deepseek-chan-wallpaper/releases/tag/brushup-build11>) を「**アプリ・ブラッシュアップ Build 11（個人テスト用）**」として公開（Published／Prerelease）。非公開リポジトリ内の個人テスト用で、一般公開リリースではない。
- 本文は[リリースノート](<release-notes-brushup-build11.md>)。Build 10 Draftをそのまま差し替え、タグ`brushup-build11`・タイトル・本文・添付をBuild 11へ更新した。旧Build 10の添付3点は削除し、Build 7／Build 6／MVP4の下書きは変更していない。
- 添付は [DMG](<../private-art/macos-out/release-b11/KujiraWallpaper-Brushup-B11-arm64.dmg>)（他Mac向け・Applicationsショートカット付き）、[ZIP](<../private-art/macos-out/release-b11/KujiraWallpaper-Brushup-B11-arm64-local-preview.zip>)、[SHA256SUMS.txt](<../private-art/macos-out/release-b11/SHA256SUMS.txt>)。
  - DMG `ca9a8a66d02f81d4b7356cdae16b1e8aae05841b988fba95a1509c3ff392b69c`
  - ZIP `695d051ab9e304b4744622f86741897c350431a90154a7e83d274b5713f93790`
- **検証**: アップロード後に`gh release view`で添付digestがローカルSHA-256と一致することを確認し、リモートタグ`brushup-build11`の存在を`git ls-remote --tags`で確認した。リリースから再ダウンロードした`SHA256SUMS.txt`で`shasum -a 256 -c`がOK、ZIPを展開したアプリの`codesign --verify --deep --strict`・`--self-test`・`--fighters-self-test`も成功。DMGの読み取り専用マウント・署名検証・イメージ内／コピー後の自己テストはDMG作成時に成功済み（再ダウンロードしたDMGはローカルとSHA-256一致）。
- Prerelease扱いのため「Latest」にはしていない。可視性・Pages・自動起動・元の壁紙設定は変更していない。素材の権利・許諾は`pending`のまま。

## 権利・次の受け入れ

- DeepSeekちゃんの原案・デザイン・世界観は元のファンコミュニティ／原案者に帰属。本プロジェクトは権利を主張せず、独自ライセンスを付与しない。新ボスの制作方法とpending状態は[クレジット](<../CREDITS.md>)・[利用条件](<../ART-LICENSE.md>)・アプリAbout／Webに反映。
- Apple Silicon・macOS 14以降の個人用試作。Developer ID署名・公証・別Macでの受け入れは未実施。

- [ ] 実ウィンドウ／通常Safari・Chromeで、READY/FIGHT、90秒、SCORE/RANK、コンボ・回避・難易度・テンポを確認。
- [ ] 主人公8キー姿勢・雑魚6姿勢・綴星リュミエ8姿勢の連続動作、武器／接触距離・突進ラインの読みやすさ（途中のデザイン承認待ちではなく実機受け入れ）。
- [ ] 敗北・TIME UP・再挑戦、もう一戦、Esc、アプリ切替・修飾キーkeyup、読み上げ・キーボード移動。
- [ ] 壁紙ON/OFF、背景3種、Space／スリープ復帰、実時間30分のCPU・メモリ・発熱。
- [ ] 新演出の可視確認：月夜の冷色・流れ星（約7分に1度）、雨音の雨筋・波紋がうるさくないか、睡眠バブル・窓辺で佇む姿が自然か。背景を切り替えても生活のリズムが破綻しないか。
- [ ] 別のMac／OS、Gatekeeper。WebKitの可視スモークは環境のhidden／occluded制約で未完了、今回も合格扱いにしていない。

次は実機で無限ボスラッシュ・アーケードの手触りと難易度、および環境演出の静けさを確認する。既存手動/自動の戦闘は同じ1舞台・敵2種・ボス1体の範囲で調整し、追加ロスターの戦闘は明示開始のendless専用に保ち、通常待機では既存3人の平和な来客だけを許可する。壁紙をゲーム面に戻したり、新キャラ・新ステージ・音・公開・依頼のないpushへ広げない。仕様は[固定アリーナ仕様](<fighters-mvp.md>)・[アート方針](<art-direction.md>)。
