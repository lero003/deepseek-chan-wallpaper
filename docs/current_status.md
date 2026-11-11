# 現在の状態 / 引き継ぎ

更新: 2026-11-12 · 非公開Web／個人用Mac試作 · 固定アリーナ・アーケード v0.8（Build 9）+ 背景別環境演出・生活微バリエーション + 生成アート + 壁紙の自動対戦

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

## 検証

- `npm run check`（`build`／Macビルドからも実行）：型検査・**Node185テスト**（+26、skipなし）・既定5素材のbyte再現性に成功。`npm run build`と`--mode placeholder`のViteビルド成功。placeholderのPNGは既定2点のみで、新3シート・ボス・テラス・制作背景／マットを含めない。
- 新規テスト（環境演出A）：夕凪ambienceのbyte一致、月夜の冷色・流れ星、雨の2パネル内落下・波紋・140quad予算、gaze・背景別リズム・mood決定性、睡眠バブル、`resolveAppearance`、native-bridgeの`setVariantJSON`。
- 新規テスト（アリーナ背景）：`battle.arena`フラグ（壁紙/ルーム/legacyは非設定）、生成絵使用中のscenery ambienceスキップとフォールバック維持、480×270検証と不正サイズのフォールバック、viewportサイズ描画（3600pxステージでない）、壁紙への非漏洩。
- 得点・90秒・TIME UP・リトライ巻き戻し・CONTINUE・コンボ倍率・ランク、同tick方向＋攻撃、突進の床予告、壁紙／ルーム／レガシーへの非影響、15/30/60fpsの30分決定性をテスト。
- `npm run mac:test -- --local-preview`／`npm run mac:test`：Swift Testing **各25件成功**（+3）。生活／自動ゲームの30分V8一致、開始・停止時計、入力ボット3連戦、帰宅、SCORE/RANK、背景切替を維持。local-previewでは44姿勢／variantのネイティブ描画、3シート×12障害（欠落・SHA・PNG破損・寸法・設定atlas・ファイルatlas・設定entry＋設定atlasのnull／文字列／数値／bool／配列）で独立フォールバックと展開後ピクセル完全一致を確認。設定atlasを辞書に限定し、FoundationのJSON書き出し例外で起動が落ちる経路も防いだ。placeholderでは制作アートなしの従来経路を確認。
- 独立レビュー担当が描画／失敗時の境界を点検し、Node回帰25件を実装。Leadがシート部分セットの回帰1件を追加して[新規Node回帰は計26件](<../tests/combat-art.test.mjs>)。Leadは全差分をレビューしてWeb・Swift・アーカイブの検証を直接実行した。新規Swiftの詳細は[CombatArtTests](<../tests/native/CombatArtTests.swift>)。
- ボス8姿勢と新44姿勢の接地・透過・台帳SHA、既存素材hash不変を確認。新アートの適用前後で書斎・legacy・受動壁紙の描画コマンドはbyte同一。
- 新演出のネイティブ描画QA：睡眠バブル・流れ星・雨筋を`--render-preview`で書き出し、 blended ピクセルを数値確認（流れ星は予測位置と一致）。**描画器の出力であり、可視アニメーションの合格ではない。**

## ローカルMac成果物（Build 9 + 環境演出A + 生成アート3施策）

- `npm run mac:build -- --local-preview` 成功。アドホック署名＋Hardened Runtime、ZIP再展開の全ファイルbyte一致・移設後の最小PATHでの自己検証／Fighters検証に成功。テラスと新3シートを同梱。Developer ID署名・公証ではない。
- [アプリ](<../private-art/macos-out/20261111211617-9d09b9ac/くじらの散歩道.app>) / [ZIP](<../private-art/macos-out/20261111211617-9d09b9ac/KujiraWallpaper-Arcade-B9-arm64-local-preview.zip>)
  - ZIP SHA-256 `f8697169827ebdcee4496a50eb5d4bc3650eae53dcb7a0a8d73fa4832fa008ac`
  - [ローカル台帳](<../private-art/macos-out/latest.json>)
- 実描画QA：[戦闘](<../private-art/macos-out/20261111211617-9d09b9ac/native-manual.png>)・[ボス](<../private-art/macos-out/20261111211617-9d09b9ac/native-boss.png>)・[結果](<../private-art/macos-out/20261111211617-9d09b9ac/native-arena-result.png>)・[万年筆ポーズ](<../private-art/qa/brushup/native-combat/combat-attack2.png>)・[敵攻撃](<../private-art/qa/brushup/native-combat/popup-0-strike.png>)。Leadはテラスと新姿勢の静止画を目視し、接地・透過・武器重複がないことを確認。**ネイティブ描画器の出力であり、実デスクトップのスクリーンショット・可視キー操作・連続アニメーションの合格ではない。**
- 環境演出AのQA（[睡眠バブル](<../private-art/qa/amb-sleep-bubbles.png>)・[流れ星](<../private-art/qa/amb-night-star-wide.png>)・[雨](<../private-art/qa/amb-rain-wide.png>)）と背景別ワイドプレビューは前Build（`20261111102451-66c9caa4`）の記録を参照。

## GitHub下書き（作成済み）

- 非公開リポジトリ `lero003/deepseek-chan-wallpaper` に **Draft／Prerelease** を作成した：[固定アリーナ・アーケード Build 9 ドラフト](<https://github.com/lero003/deepseek-chan-wallpaper/releases/tag/untagged-5895c003bdef1ecd0b46>)。リリース名は「固定アリーナ・アーケード Build 9 ドラフト（個人テスト用）」。
- 添付は `KujiraWallpaper-Arcade-B9-arm64-local-preview.zip`（2,769,540 bytes、SHA-256 `7a2182ffc2dc1401ad558ae6e69a4f38c70816361d90e0ca84fdec4836457358`）と `SHA256SUMS.txt`。GitHub上のasset digestも同じSHA-256。
- 作成後に再ダウンロードし、`shasum -a 256 -c SHA256SUMS.txt` がOK、`codesign --verify --deep --strict` が有効、ZIP展開後のアプリを最小PATHの`env -i`で起動する`--fighters-self-test`が成功することを確認した。
- 下書きの`tagName`は`arena-arcade-build9`だが、Draftのためリモートにタグは作成されていない（`git ls-remote --tags`で0件）。公開・可視性変更・Pages・公開リリースは行っていない。リポジトリはPRIVATEのまま。
- 下書き作成時のソースは未commitだったが、その後ローカルcommit `2b3171b` へ保存済み。push・下書き更新はしていないため、下書きの対象コミットにはBuild 9のソース変更を反映していない。下書きZIPと現在のローカル成果物を混同しない。
- 以前のBuild 7／Build 6／MVP4の下書きは変更していない。

## 権利・次の受け入れ

- DeepSeekちゃんの原案・デザイン・世界観は元のファンコミュニティ／原案者に帰属。本プロジェクトは権利を主張せず、独自ライセンスを付与しない。新ボスの制作方法とpending状態は[クレジット](<../CREDITS.md>)・[利用条件](<../ART-LICENSE.md>)・アプリAbout／Webに反映。
- Apple Silicon・macOS 14以降の個人用試作。Developer ID署名・公証・別Macでの受け入れは未実施。

- [ ] 実ウィンドウ／通常Safari・Chromeで、READY/FIGHT、90秒、SCORE/RANK、コンボ・回避・難易度・テンポを確認。
- [ ] 主人公8キー姿勢・雑魚6姿勢・綴星リュミエ8姿勢の連続動作、武器／接触距離・突進ラインの読みやすさ（途中のデザイン承認待ちではなく実機受け入れ）。
- [ ] 敗北・TIME UP・再挑戦、もう一戦、Esc、アプリ切替・修飾キーkeyup、読み上げ・キーボード移動。
- [ ] 壁紙ON/OFF、背景3種、Space／スリープ復帰、実時間30分のCPU・メモリ・発熱。
- [ ] 新演出の可視確認：月夜の冷色・流れ星（約7分に1度）、雨音の雨筋・波紋がうるさくないか、睡眠バブル・窓辺で佇む姿が自然か。背景を切り替えても生活のリズムが破綻しないか。
- [ ] 別のMac／OS、Gatekeeper。WebKitの可視スモークは環境のhidden／occluded制約で未完了、今回も合格扱いにしていない。

次は実機でアーケードの手触りと難易度、および新演出の静けさを確認する。戦闘は同じ1舞台・敵2種・ボス1体の範囲で数値を調整。壁紙をゲーム面に戻したり、新キャラ・新ステージ・音・公開・依頼のないpushへ広げない。仕様は[固定アリーナ仕様](<fighters-mvp.md>)・[アート方針](<art-direction.md>)。