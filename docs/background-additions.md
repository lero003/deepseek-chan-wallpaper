# 追加背景：朝凪・雪あかり

ユーザーの「背景を増やす」「書斎と戦闘の両方」「2種類ぐらい」の依頼を反映。

| 場面 | 追加 | 現在の合計 | 反映先 |
| --- | --- | --- | --- |
| 通常の書斎 | 朝凪の書斎、雪あかりの書斎 | 5背景 | Web背景選択、Mac Build13の背景メニュー |
| 無限ボスラッシュ | 朝凪の温室、雪あかりの中庭 | 6舞台 | Web/DSHのボス交代時の舞台抽選 |

新しい画像4枚はbuilt-in image_genで既存書斎/テラスの画風・構図を参照して制作。480×270/192色へ処理し、書斎には原画中心byte一致の1024×576マットを追加。原本は`private-art/masters/background-additions-20261112/`、処理/プロンプトは`private-art/production/build-background-additions.py`と`background-additions-prompts.md`。既存台帳17ファイル不変。画像・マット・台帳・処理原本はローカル専用でGit対象外、権利pending。

Webはignored art.tsのvariants/arenaBackdrops、Macはvariants.json、DSHはart.mjsのarenaBackdropsから新画像を読み込む。戦闘画像の失敗は該当舞台だけコード描画。placeholderは画像を参照せず、温室/雪中庭が別のコード背景として出る。手動3連戦・壁紙の30秒自動対戦は既存固定テラスのまま。

`npm run check`229件、通常/placeholder Webビルド、Swift各29件で検証。DSHは87件と8PNG監査。可視の実壁紙・DSH/HMR/入力・長時間負荷は未受入。旧Build12を更新しない限り、新背景はメニューに現れない。
