# 現在の状態 / 引き継ぎ

更新: 2026-11-11 · 非公開Web／個人用Mac試作 · 固定アリーナ・アーケード v0.8（Build 9）+ 背景別の環境演出・生活の微小バリエーション

## 今回の変更（ブラッシュアップ A：背景別の環境演出と生活の微小バリエーション）

承認済みアート（主人公16コマ・背景3種・マット）は1pxも変更せず、コードのみで磨いた。Build 9のソースは先にローカルcommit済み（`2b3171b`、pushはしていない）。

- **背景別の環境演出**：[ambience](<../src/render/ambience.ts>)に背景プロフィールを追加。夕凪は承認済みの暖色・小鳥のまま（プロフィール無しとbyte一致をテストで固定）。月夜は冷色の光粒・海面きらめき、小鳥なし、upper paneをゆっくり横切る流れ星（約7分に1度・1.8秒）、ランプ明滅をわずかに増量。雨音は窓の2パネル内を落ちる雨筋（横框・縦框を跨がない／描かない）、水面の波紋、小鳥なし。すべて矩形コマンドでCanvasとCoreGraphicsが共有。
- **生活の微小バリエーション**：[world](<../src/world/world.ts>)に「窓辺の景観スポットまで歩いて長く佇む」gaze（45秒クールダウン）と背景連動リズム（月夜は眠りやすい・雨音は窓辺で過ごしやすく）を追加。[scene-plan](<../src/render/scene-plan.ts>)に睡眠中の小さな泡。新規コマ・新規画像なし、seed付き遷移のみで決定性を維持。
- **配線**：[art-profile](<../src/app-web/art-profile.ts>)に`VariantAppearance`と`resolveAppearance`、[renderer](<../src/render/renderer.ts>)に`activeAppearance`。Webは背景切替でappearanceとmoodを追従。Macは[native-bridge](<../src/app-mac/native-bridge.ts>)の`setVariantJSON`→[ScenePainter.selectVariant](<../src/app-mac/Core/ScenePainter.swift>)が共有コアのappearance/moodを同期。[prepare-macos](<../scripts/prepare-macos.mjs>)とローカル`variants.json`がappearanceを搬送。
- 戦闘（アリーナ）は固定テラスで背景選択の影響を受けない。壁紙の小事件・レガシールートは従来どおり得点も時計も持たない。

## 以前の変更（2回のアーケード点検と改善）

- **1回目：点検で見つけた弱点**：開戦の合図が実際に描かれておらず「合図を待つ」表示だけだった／得点・評価・制限時間がなく、うまくなる目標がなかった／生の命中数をそのまま得点にするとリトライで稼げた。
- **1回目：改善**：各ラウンド90秒のアーケード時計、命中（実ダメージ×25×コンボ倍率、5コンボごとに最大4倍）、KO（雑魚100／ボス1000）、クリア時の残り秒・残HP・ノーダメージ・ボーナス、S/A/B/CのRANK、CONTINUE回数を追加。開戦はREADY→FIGHT、HUDにSCORE/TIME、結果にRANK/SCORE/最大コンボ/CONTINUEを表示。失敗ラウンドの得点はクリア済みチェックポイントへ巻き戻し、CONTINUEだけ残すのでリトライ稼ぎにならない。得点は診断用の生統計（runStats）から分離した。
- **2回目：点検で見つけた弱点**：方向入力と攻撃を同じtickに入れると、押した方向へ振り向かず逆向きに空振りした（P1）／ボスの突進は技名だけで、どこへ突っ込むかの床の手掛かりがなかった。
- **2回目：改善**：攻撃開始前にそのtickの方向入力を反映するよう修正。突進（思索のステップ）の予備動作中、床に進行方向の警告ラインを表示。どちらも回帰テストを追加した。
- 壁紙の小事件・承認済み16コマ・背景3種・レガシールートには、得点も時計も影響しないことをテストで固定。

## 現在の実装

- **手動の入口は固定アリーナ**：「テラスで3連戦」。カメラ960固定、徒歩での区間解放なし。第1ラウンド3体 → 第2ラウンド4体 → 綴星リュミエ1体との一騎打ち。雑魚は従来のスライム／ポップアップのみ、ボス枠も1体のみ。
- **開始と区切り**：開戦準備（READY）→ 戦闘（FIGHT）→ 安全な休息／HP+1 → 次へ。ボス対面中は描画だけ。開始・休息中は攻撃・被弾・敵弾更新を止める。
- **時計と得点**：開戦準備・休息・ポーズ・フォーカス喪失中は減らない。命中はヒットストップを含む。90秒でTIME UP、敗北と同じ再挑戦へ。得点は実効ダメージのみ（オーバーキルや死体への追撃は加算しない）。
- **新ボス制作案**：綴星リュミエ／琥珀の思考家。Claudeの文章・思考を着想にしたオリジナル案で、公式キャラ／Anthropic社の提携・承認ではない。96×112px×8姿勢、シート384×224px、足元48/108、共有80色、alpha0/255。生成原本・加工・レビュー・本番素材はGit対象外。画像なし／読込失敗は両レンダラーが共通の簡易美少女描画へ戻る。
- **Web／Mac導線**：HUDのROUND/TIME/SCORE、結果のRANK/CONTINUE、開始・終了中の攻撃ボタン無効、状態別の再挑戦／もう一戦。Web読み上げはラウンド／フェーズ単位。帰宅フェードは静かな部屋へ切り替え、結果紙は主人公の顔を隠さない。

## 壁紙・承認済み素材の保全

- 普段は静かな生活、自動事件と「事件を見る」は書斎内の小事件だけ。カメラ0、HUD・章題・ボスなし。手動対戦中の受動的な壁紙面も静かな生活のまま。旧4エリア・12区間は内部回帰テスト用。
- 承認済み主人公80×112px・16コマ、夕凪／月夜／雨音の背景と各マットの8ファイルはSHA-256不変。1024×576マット中央の480×270は各原画とbyte一致、壁紙の整数倍率2倍以上・環境演出も維持。
- 保存設定は一時停止・省電力・小事件頻度・エフェクト量・背景の5つだけ。戦闘進行・スコア・キー・壁紙ONは保存しない。非表示／Reduce Motion／セッション／スリープ停止を弱めていない。
- AppKit／CoreGraphics／JavaScriptCoreと共有TypeScriptを維持。新しい依存・専用ブラウザー・音・通信・AI/API・分析・通知・自動起動は追加していない。壁紙ON／元壁紙の設定変更もビルド・テストでは行っていない。

## 検証

- `npm run check`：型検査・**Node 153テスト**・既定5素材のbyte再現性に成功。`npm run build`：Vite本番ビルド成功。
- 新規テスト：夕凪ambienceのbyte一致（プロフィール無し＝明示sunset）、月夜の冷色・小鳥なし・流れ星の希少性とupper pane/縦框クリップ、雨の2パネル内落下・横框/縦框非跨ぎ・波紋・140quad予算、gazeの到達・長いidle・クールダウン・範囲内、背景別リズム（月夜は睡眠増・雨音はgaze増）、moodの15/60fps決定性、睡眠バブルの装飾ゲート・非変異、`resolveAppearance`のマージ、native-bridgeの`setVariantJSON`（appearance/mood同期・不正index拒否）。
- 得点・90秒・TIME UP・リトライ巻き戻し・CONTINUE・コンボ倍率・ランク、同tick方向＋攻撃、突進の床予告、壁紙／ルーム／レガシーへの非影響、15/30/60fpsの30分決定性をテスト。
- `npm run mac:test -- --local-preview`：Swift Testing **21件成功**（JavaScriptCoreとV8の生活／自動ゲーム30分一致、アリーナの開始・停止時計、操作ボットの3連戦完走、ボス描画、帰宅、結果とSCORE/RANK、背景切替のmood/palette追従を確認）。`npm run mac:test`（placeholder）も21件成功。
- 独立レビュー用のサブエージェントは途中で失敗し、報告は得られなかった。最終検証はLeadが同じコマンドで直接実行した。
- ボス画像QAは前回どおり、8姿勢の接地・透過・台帳SHA・既存素材hash不変。Viteのlocal／placeholder分離も前回検証を維持している。
- 新演出のネイティブ描画QA：睡眠バブル・流れ星・雨筋を`--render-preview`で書き出し、 blended ピクセルを数値確認（流れ星は予測位置と一致）。**描画器の出力であり、可視アニメーションの合格ではない。**

## ローカルMac成果物（Build 9 + 環境演出A）

- `npm run mac:build -- --local-preview` 成功。アドホック署名＋Hardened Runtime、ZIP再展開のbyte一致・移設後のシステムPATHだけでの自己検証に成功。
- [アプリ](<../private-art/macos-out/20261111102451-66c9caa4/くじらの散歩道.app>) / [ZIP](<../private-art/macos-out/20261111102451-66c9caa4/KujiraWallpaper-Arcade-B9-arm64-local-preview.zip>)
  - ZIP SHA-256 `1f28504bd6e6facad14efc51c1ed3cc8513398c0ac35a8ea7d33e20ba84017d4`
  - [ローカル台帳](<../private-art/macos-out/latest.json>)
- 背景別のワイドプレビュー（[夕凪](<../private-art/macos-out/20261111102451-66c9caa4/native-preview-wide.png>)・[月夜](<../private-art/macos-out/20261111102451-66c9caa4/native-preview-night-wide.png>)・[雨音](<../private-art/macos-out/20261111102451-66c9caa4/native-preview-rain-wide.png>)）と、新演出のQA（[睡眠バブル](<../private-art/qa/amb-sleep-bubbles.png>)・[流れ星](<../private-art/qa/amb-night-star-wide.png>)・[雨](<../private-art/qa/amb-rain-wide.png>)）。**実際の描画器の出力であり、可視キー操作・可視アニメーションの合格ではない。**
- 前Build（`20261111091413-9cde65b8`）のアーケードPNG・smoke結果はそのまま有効。今回の差分は環境演出・生活リズム・背景appearance配線のみで、戦闘ロジックは不変。

## GitHub下書き（作成済み）

- 非公開リポジトリ `lero003/deepseek-chan-wallpaper` に **Draft／Prerelease** を作成した：[固定アリーナ・アーケード Build 9 ドラフト](<https://github.com/lero003/deepseek-chan-wallpaper/releases/tag/untagged-5895c003bdef1ecd0b46>)。リリース名は「固定アリーナ・アーケード Build 9 ドラフト（個人テスト用）」。
- 添付は `KujiraWallpaper-Arcade-B9-arm64-local-preview.zip`（2,769,540 bytes、SHA-256 `7a2182ffc2dc1401ad558ae6e69a4f38c70816361d90e0ca84fdec4836457358`）と `SHA256SUMS.txt`。GitHub上のasset digestも同じSHA-256。
- 作成後に再ダウンロードし、`shasum -a 256 -c SHA256SUMS.txt` がOK、`codesign --verify --deep --strict` が有効、ZIP展開後のアプリを最小PATHの`env -i`で起動する`--fighters-self-test`が成功することを確認した。
- 下書きの`tagName`は`arena-arcade-build9`だが、Draftのためリモートにタグは作成されていない（`git ls-remote --tags`で0件）。公開・可視性変更・Pages・公開リリースは行っていない。リポジトリはPRIVATEのまま。
- ソースはローカル未commitのまま。今回の依頼はリリース下書きの作成であり、ソース同期の依頼ではないためpushしていない。このため下書きの対象コミットには今回のソース変更は含まれない。ZIPがビルド済みの成果物。
- 以前のBuild 7／Build 6／MVP4の下書きは変更していない。

## 権利・次の受け入れ

- DeepSeekちゃんの原案・デザイン・世界観は元のファンコミュニティ／原案者に帰属。本プロジェクトは権利を主張せず、独自ライセンスを付与しない。新ボスの制作方法とpending状態は[クレジット](<../CREDITS.md>)・[利用条件](<../ART-LICENSE.md>)・アプリAbout／Webに反映。
- Apple Silicon・macOS 14以降の個人用試作。Developer ID署名・公証・別Macでの受け入れは未実施。

- [ ] 実ウィンドウ／通常Safari・Chromeで、READY/FIGHT、90秒、SCORE/RANK、コンボ・回避・難易度・テンポを確認。
- [ ] 綴星リュミエのデザイン最終確認、8姿勢の連続動作、突進ラインの読みやすさ。
- [ ] 敗北・TIME UP・再挑戦、もう一戦、Esc、アプリ切替・修飾キーkeyup、読み上げ・キーボード移動。
- [ ] 壁紙ON/OFF、背景3種、Space／スリープ復帰、実時間30分のCPU・メモリ・発熱。
- [ ] 新演出の可視確認：月夜の冷色・流れ星（約7分に1度）、雨音の雨筋・波紋がうるさくないか、睡眠バブル・窓辺で佇む姿が自然か。背景を切り替えても生活のリズムが破綻しないか。
- [ ] 別のMac／OS、Gatekeeper。WebKitの可視スモークは環境のhidden／occluded制約で未完了、今回も合格扱いにしていない。

次は実機でアーケードの手触りと難易度、および新演出の静けさを確認する。戦闘は同じ1舞台・敵2種・ボス1体の範囲で数値を調整。壁紙をゲーム面に戻したり、新キャラ・新ステージ・音・公開・依頼のないpushへ広げない。仕様は[固定アリーナ仕様](<fighters-mvp.md>)・[アート方針](<art-direction.md>)。