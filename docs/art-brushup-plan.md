# アートブラッシュアップ計画（2）— 生成アート方針

状態: **2-1テラス背景はA案で統合済み（commit `531ecc8`）／2-2・2-3は生成プロンプト確定済み・画像対応モデル待ち**。0とAと2-1の実装・自動検証は完了（commit `2b3171b`, `b73a258`, `531ecc8`）。実機受け入れと2-1の最終目視はユーザー/画像モデルで実施（未完了）。

- **2-1完了**: ユーザーが**A / v01（雲と海面の描き込み重視）**を選択。`runtime/scene/arena/terrace.png`（480×270・192色）を手動アリーナ専用背景として統合。壁紙・書斎の小事件・legacyは不変、画像なしはコード描画へフォールバック。承認済み8ファイルはSHA不変。詳細は[current_status](<current_status.md>)。試作時の[B / v02案](<../private-art/qa/brushup/terrace/terrace-proposal-v02-characters-3x.png>)・[比較](<../private-art/qa/brushup/terrace/terrace-proposals-characters-comparison.png>)・[レビュー記録](<../private-art/qa/brushup/terrace/proposal-review.json>)は参照として保存。
- **2-2/2-3準備済み**: 生成プロンプトを確定して保存（未生成・未統合）。画像対応モデルへ再切り替え後、これらを `imagegen` に渡して試作→ユーザー承認→加工→統合する。
  - 2-2 主人公戦闘コマ: [generation-prompt.md](<../private-art/qa/brushup/hero-combat/generation-prompt.md>)
  - 2-3 雑魚2種: [generation-prompt.md](<../private-art/qa/brushup/enemies/generation-prompt.md>)
- 制約: 承認済み主人公16コマ・背景3種・マットはbyte不変／戦闘コマ・雑魚は別シート+コードフォールバック／敵2種+ボス1体・1舞台／ローカル専用・公開再配布未許諾／無音・依存追加なし・Playwrightなし。未承認アートをruntimeへ統合しない。

## 目的と順序

Fighters の見た目を「仮のピクセル図形」から世界観に合う完成アートへ引き上げる。**3つとも順番に徹底的に**行う。

1. **テラス戦闘背景**（アリーナの背景）
2. **主人公の専用戦闘コマ**（別シート）
3. **雑魚2種（スライム／ポップアップ）のアート**

各タスクは **生成 → ユーザーのデザイン承認 → 加工 → 統合 → 検証 → docs更新・commit** の順。承認前に統合しない。

## 絶対に守る制約

- **承認済みアートはbyte不変**: 主人公16コマ（`runtime/character/sheet.png`）・背景3種・各ワイドマット。SHA-256を加工前後で照合し、1pxも変えない。
- **敵構成の維持**: 敵2種（スライム／ポップアップ）+ ボス1体（綴星リュミエ）・1舞台（固定テラスアリーナ）。新キャラ・新ステージ・新ボスを追加しない。
- **ローカル専用・非公開**: 生成素材は`private-art/`（Git対象外）。公開・再配布・Mac同梱許諾は未確認のまま。`permission`は`unverified-local-app-preview-only`。
- **フォールバック必須**: 素材なし／読込失敗／不正サイズはコード描画へ戻る。`--mode placeholder`はprivateアートをimportしない。クリーンなチェックアウトを壊さない。
- **無音・依存追加なし・Playwright/専用ブラウザーなし・AI/API/分析/通知なし**。
- **主人公アイデンティティ厳守**: [art-direction.md](<art-direction.md>)の「外せない特徴」（ヒレ耳・髪飾り・メイド服・尾・半目など）を戦闘コマでも維持。別人へ戻さない。
- 実機の可視・操作・負荷の受け入れはユーザー実施。自動テスト合格だけで「合格」としない。

## 共通パイプライン（既存の実績を再利用）

- **生成**: `imagegen`（GPT Image backend）。**承認済みデザインを参照画像に指定**してアイデンティティを揃える。
  - 主人公の基準: `private-art/concepts/deepseek-chan-design-v02.png`（fin-ear v02・承認済み）。
  - 背景の基準: `private-art/runtime/scene/seaside-room.png`（承認済み書斎）。
- **加工**: `private-art/production/`の既存スクリプト（bundled Pillow/numpy・ダウンロードなし）。
  - スプライト整列・減色・接地: `fighters/prepare_lumie.py`がテンプレート（バイナリalpha・足元アンカー・共有80色・nearest）。
  - 背景の原寸変換・減色: `build-wallpaper-variants.py`の`build_scene`（480×270・192色・ditherなし）。
- **台帳/来歴**: `runtime/manifest.json`にSHA-256・出典・`permission`を追加。`production/generation-record.json`に生成記録（参照画像のSHA・プロンプト要約・permission）を追記。
- **クレジット**: [CREDITS.md](<../CREDITS.md>)・[ART-LICENSE.md](<../ART-LICENSE.md>)・アプリAbout／Webの provenance を更新。
- **検証**: `npm run check` / `npm run build` / `npm run mac:test -- --local-preview`（+placeholder）/ `npm run mac:build -- --local-preview`。ネイティブ描画QA（`--render-preview`/`--render-manual`等）を数値確認。**これらは可視・操作の合格ではない**。

---

## 2-1. テラス戦闘背景

### 現状
- アリーナ背景はコード描画（[scenery.ts](<../src/fighters/scenery.ts>) `terraceArea`）。3600pxスクロールステージの一部で、アリーナはカメラ960固定。
- 構図定数: `HORIZON=132`, `RAIL_TOP=172`, `RAIL_BOTTOM=196`, `DECK_TOP=196`, `SUN_X=1046`, `SUN_Y=84`（ステージ座標）。
- アリーナ表示（カメラ960）では太陽は画面x≈86・y84、水平線y132、手すりy172-196、デッキy196-270。**キャラはy218-254（足元238）に立つ**。

### 目標
夕暮れの海辺テラスの生成ピクセルアート背景。承認済み書斎と同じ暖色ダスクパレット・クリスプなドット。戦闘が映える落ち着いた舞台。

### アートディレクション
- 横 viewed straight-on（2D格闘の舞台）。**キャラ・文字・UIなし**の空背景。
- 上から: パーゴラの梁+暖色の電球（画面上部）、夕焼け空（紫→桃）、海（水平線y≈132・夕日の反射・小舟・遠い灯台）、手すり（y≈172-196）、**木のデッキ（y≈196-270・中央は完全に空ける＝歩行帯）**。
- ランプ・ベンチ・プランターは左右端のみ。中央デッキに物を置かない。
- 既存のアニメ演出（[drawSceneryAmbience](<../src/fighters/scenery.ts>)の太陽フレア・海面きらめき・鳥）を再利用するため、**構図は上記定数に合わせる**のを基本とする（合わせるか、演出側を調整するかは統合時に決定）。

### 生成プロンプト（案・切替後に調整）
> A wide 16:9 landscape retro 16-bit pixel-art background for a cozy seaside fighting-game stage at dusk. Clean crisp pixels, hard edges, no anti-aliasing, limited warm palette (purples, mauves, peach, gold, rose-brown), matching a warm sunset pixel-art study room. Straight-on side view. NO characters, NO people, NO text, NO UI.
> Composition top→bottom: a dark wooden pergola beam with sagging warm festoon bulbs across the top (~12%); dusk sky gradient deep-purple→peach; a calm sea with the sunset reflection, tiny sailboats and a distant lighthouse, horizon at ~49% height; a wooden railing with balusters at ~64-72% height; an open wooden plank deck in the bottom ~28%, completely clear in the center (characters will stand here). One or two warm lamps, a bench and a planter tucked at the far left/right edges only. The sun sits low near the left-of-center (~18% width, ~31% height). Calm, nostalgic, cohesive single pixel-art game background, not a photo or painting.

- 参照画像: 承認済み書斎（`runtime/scene/seaside-room.png`）でパレット・ドットの質感を揃える。
- 生成は16:9 landscape。加工で480×270へ。

### 加工
- `build_scene`相当: LANCZOSで480×270 → 192色・ditherなし。**マットは不要**（戦闘専用背景）。
- 出力: `runtime/scene/arena/terrace.png`（Git対象外）。台帳に追加。

### 統合（選択肢・実装時に決定）
- **案A（推奨）**: アリーナ専用480×270背景。カメラ960固定なので、アリーナ描画パスでこの画像を背景に使う。legacyスクロールルートはコード描画のまま（テスト専用）。
  - 統合箇所: [render-plan.ts](<../src/fighters/render-plan.ts>)のarenaパス、[renderer.ts](<../src/render/renderer.ts>)`cacheWideBackground`/`drawPlan`、[ScenePainter.swift](<../src/app-mac/Core/ScenePainter.swift>)`wideBackdrop`。art-profileに`arenaBackdropUrl`、native configに搬送。
  - 既存アニメ演出は定数整合なら維持、不合なら調整。
- **案B**: テラスのワイド帯（例:900×270）を生成しスクロールステージのテラス位置に合成。アリーナ+legacy両方に効くが、生成・整合の難易度が上がる。
- どちらでも**フォールバック**（画像なし→既存コード描画）を維持。

### 検証
- ネイティブ`--render-manual`/`--capture-boss`でアリーナ背景を書き出し、数値確認（パレット・寸法・歩行帯のクリアランス）。
- `check`/`build`/`mac:test`/`mac:build`。承認済み背景3種・マットのSHA不変を照合。
- 可視確認はユーザー（背景がうるさくないか・キャラが沈まないか）。

### 承認ゲート
生成案（原寸+3x）を提示 → ユーザーが構図・パレット・歩行帯を承認 → 加工・統合。

---

## 2-2. 主人公の専用戦闘コマ

### 現状
- 承認済み16コマを流用し、回転・スケール+武器オーバーレイ（[render-plan.ts](<../src/fighters/render-plan.ts>)`drawHero`、[art.ts](<../src/fighters/art.ts>)`drawBookSwing`/`drawQuillThrust`/`drawSpinStars`/`drawSlash`）で戦闘を表現。

### 目標
ボス（綴星リュミエ）の8姿勢シートと同様に、**主人公の専用戦闘ポーズシート**を新設。攻撃・回避・必殺・被弾・ダウンが実際の姿勢で描かれ、手応えと説得力を上げる。

### 制約
- **承認済み16コマは不変**。戦闘コマは**別シート**（`runtime/character/combat/`等）。生活（待機・歩行・睡眠）は引き続き承認済み16コマ。
- アイデンティティ厳守（art-direction.md）。ヒレ耳・髪飾り・リボン・メイド服・尾・半目を戦闘ポーズでも維持。
- 足元アンカー・接地・共有パレット・バイナリalpha（`prepare_lumie.py`と同基準）。

### アートディレクション / ポーズ構成（案）
ボスと同型の8姿勢を想定（実装時に増減可）:
`idle`(構え) / `attack1`(本の一閃) / `attack2`(万年筆の突き) / `attack3`(くるりスピン) / `dodge`(回避) / `special`(必殺・潮の解放) / `hurt`(被弾) / `down`(ダウン)。
- 武器: 本・万年筆（既存オーバーレイと対応）。必殺は淡い水のオーラ。
- サイズは80×112（承認済みと同寸）または96×128。足元アンカーを揃え、接地を維持。

### 生成プロンプト（案・切替後に調整）
- **参照画像に承認済みデザイン`concepts/deepseek-chan-design-v02.png`（と承認済み16コマの待機 frame）を指定**し、別人化を防ぐ。
> Using the APPROVED whale-girl design in the reference image, produce ONE pixel-art combat pose sheet of the SAME character (keep her exact identity: blue-violet long wavy hair with aqua curled tips and bent ahoge, white frilled headband, whale hair clip, navy big ribbon, low whale-fin ears (navy top / pale underside), half-lidded blue eyes, navy maid dress with white frills and gold trim, whale-motif apron, starfish/wave hem, pale whale tail, white frilled socks and dark Mary-Jane shoes, chibi proportions). Eight full-body poses on a transparent/keyed background, consistent scale and foot ground line, crisp pixel art, shared limited palette, no text, no extra characters: ready stance, book swing, quill thrust, spin attack, dodge, special (water aura), hurt, down. Keep the fin-ears and all ornaments in every pose. Do not redesign the character.

### 加工
- `prepare_lumie.py`をテンプレートに`prepare_hero_combat.py`を作成（カットアウト・バイナリalpha・足元整列・共有80色・nearest・シート化・atlas.json・3xレビュー・処理レポート）。
- 出力: `runtime/character/combat/sheet.png` + `atlas.json`（posesマップ）。台帳に追加。

### 統合
- art-profileに`combatAtlas`/`combatUrl`（`bossAtlas`/`bossUrl`と同型）。native configへ搬送。
- `drawHero`が戦闘状態（attack/dodge/special/hurt/down）で戦闘シートを参照。生活状態は承認済み16コマのまま。
- **フォールバック**: シートなし／読込失敗は既存の回転+オーバーレイ描画へ戻る。placeholderはimportしない。
- 既存の武器オーバーレイ/エフェクトは、専用コマと二重にならないよう整理（コマに武器が含まれる場合はオーバーレイを抑制）。

### 検証
- 接地・透過・共有色数・フレーム欠落/重複を自動検証（`art-profile.test.mjs`のローカル検証を拡張）。キャラの同一性・衣装の忠実さ・動作の自然さは自動判定で合格にせず、原寸／拡大／連続動作を目視しユーザー承認を得る。
- `check`/`build`/`mac:test`/`mac:build`。ネイティブ`--render-manual`で各ポーズを書き出し数値確認。
- **承認済み16コマ・背景のSHA不変**を照合。
- 可視・アニメの自然さはユーザー確認（自動合格としない）。

### 承認ゲート
生成案（8姿勢・原寸+3x・承認済みデザインとの並置）を提示 → ユーザーがアイデンティティ・ポーズを承認 → 加工・統合。

---

## 2-3. 雑魚2種（スライム／ポップアップ）のアート

### 現状
- コード描画（[art.ts](<../src/fighters/art.ts>)`drawSlime`/`drawPopup`）。variants（normal/fast/tough）は tint・scaleで表現。

### 目標
世界観（海辺・夕暮れ）に合う生成ピクセルアートスプライト。**2種の範囲は維持**（新敵種を追加しない）。

### アートディレクション（案）
- **スライム**: 潮だまりの水の精。半透明感のあるゼリー質・泡・小さな目。fast=細身/素早い色、tough=大ぶり/濃い色。
- **ポップアップ**: インク/紙の生き物（インク弾を吐く）。紙片・インク滴・小さな目。fast/toughで色・形を変える。
- 既存のアニメ（待機bob・windup・strike・exit）に対応するポーズ。ボス/主人公より小さいサイズ（例:48×48〜64×64）。

### 生成プロンプト（案・切替後に調整）
- 参照画像: 承認済み書斎（パレット整合）+ 既存コード描画のレビュー画像（形の参考）。
> Pixel-art sprite sheets for two small seaside creatures, matching a warm dusk pixel-art style, transparent/keyed background, crisp pixels, shared limited palette, no text. (1) A tide-pool water slime: jelly body with bubbles and tiny eyes, poses idle/move/windup/strike/exit, plus a fast and a tough variant. (2) An ink-and-paper popup creature: paper scraps and ink droplets with tiny eyes, same pose set, plus fast and tough variants. Keep them small and cute, consistent scale and ground line, clearly two distinct species only.

### 加工
- `prepare_lumie.py`をテンプレートに種ごとのシート化（バイナリalpha・接地・共有パレット）。variantsは色替え/別ポーズで対応。
- 出力: `runtime/fighters/slime/`, `runtime/fighters/popup/`（sheet+atlas）。台帳に追加。

### 統合
- art-profileにenemy atlases（`slimeAtlas`/`popupAtlas`等）。`drawEnemy`が種・variantで参照。
- **フォールバック**: 画像なし→既存コード描画。placeholderはimportしない。
- 当たり判定・サイズ・ノックバックは既存のゲームロジックを維持（アートのみ差し替え、バランスは変えない）。

### 検証
- 接地・透過・色数・フレーム検証。`check`/`build`/`mac:test`/`mac:build`。ネイティブ描画QA。
- 承認済みアートのSHA不変。可視はユーザー確認。

### 承認ゲート
生成案（2種×variants・原寸+3x）を提示 → ユーザー承認 → 加工・統合。

---

## 全体の受け入れと記録

- 各タスク統合後に `docs/current_status.md`・[fighters-mvp.md](<fighters-mvp.md>)・[art-direction.md](<art-direction.md>)・CREDITS/ART-LICENSE を更新し、ローカルcommit（pushは明示依頼時のみ）。
- 実機受け入れ（可視・操作・壁紙ON/OFF・Space/スリープ・30分負荷）はユーザー実施のチェックリストとして残す。**自動テスト/描画QAは合格の代替にしない**。
- 生成素材の公開・再配布・Mac同梱許諾は未確認のまま維持。公開・Public化・Pages・依頼のないpushは行わない。

## 次のアクション

1. 本計画と `docs/current_status.md` を読む。2-1は統合済み。
2. **画像対応モデルへの再切り替えを待つ**（現セッションがテキスト専用なら生成不可）。切替後、2-2の[確定プロンプト](<../private-art/qa/brushup/hero-combat/generation-prompt.md>)を `imagegen` に参照画像付きで渡して試作する。
3. 生成案（原寸+3x・承認済みデザインとの並置）を提示し**ユーザー承認**を得る。未回答／スキップは承認として扱わず、統合や次タスクを自動で進めない。
4. 承認後に加工・統合・検証（check/build/mac:test/local-preview+ネイティブQA）・docs更新・commit。次いで2-3も同様に別承認を得て進める。