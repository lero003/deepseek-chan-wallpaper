# Fighters MVP4 ドラフト（個人テスト用）

> **これは非公開リポジトリの下書きリリースです。公開リリースではありません。**
> 素材の権利・公開許諾は未確認のため、再配布・公開アップロードをしないでください。

## 内容

「くじらの散歩道」のMacアプリに、ファイナルファイト式の横スクロール乱戦を追加した個人検証用ビルド。

- 書斎 → 海辺のテラス → 潮風の遊歩道 → 夕凪の桟橋の4エリア、12セクション
- 区切りでカメラ固定、画面の左右から敵が登場。1〜2波を倒すとGO矢印で次へ
- スライム3種・ポップアップ3種・ボス1体。区間クリアでHP+1、敗北は区間からリトライ
- 手動は約3分。壁紙オートは短縮ルートで静かに帰宅
- 元の壁紙設定・自動起動は変更しない。音・通信・解析なし

## 添付

| ファイル | 用途 |
| --- | --- |
| `KujiraWallpaper-Fighters-MVP4-draft-arm64.dmg` | Apple Silicon向け。アプリと注意書きを同梱 |
| `KujiraWallpaper-Fighters-MVP4-arm64-local-preview.zip` | 同内容のZIP（検証済み） |
| `SHA256SUMS.txt` | DMGとZIPのチェックサム |

## 動作環境と起動

- Apple Silicon（arm64）、macOS 14以降
- アドホック署名のみ、Apple公証なし。初回はアプリを右クリック →「開く」
- macOS全体の保護設定は無効にしない。個別許可は「システム設定 > プライバシーとセキュリティ」
- 詳細はDMG内の `READ-ME-FIRST.txt` と [リリースDMGの試用](https://github.com/lero003/deepseek-chan-wallpaper/blob/main/docs/dmg-release.md) を参照

## 検証済み

- Node 71テスト / Swift Testing 16テスト
- 12セクションの自動完走（150〜162秒）、30分シミュレーション、左右出現、区間リトライ
- DMGの読み取り専用マウント、署名検証、DMG内アプリの自己テスト、コピー後の単体起動
- ZIP/DMGのSHA-256

## 未確認

- 可視状態でのキー操作の感触、壁紙ON/OFF、Space、スリープ復帰
- 実時間30分のCPU・メモリ・発熱、別のMac／OS、Gatekeeperの挙動
- 専用の戦闘コマ・完成素材・音は未制作

## チェックサム

```
80cfd08384545ce76b566f9f712a271c7c128c7addf316136dc8ea8d9f6791f1  KujiraWallpaper-Fighters-MVP4-draft-arm64.dmg
1e8c43aba1ac772f555df3fa960d7134bfc7569d41df5feaa3f187e4ff848697  KujiraWallpaper-Fighters-MVP4-arm64-local-preview.zip
```

## 扱い

下書きのまま維持し、権利確認と実機受け入れが終わるまで公開しない。リポジトリの可視性・Pages・自動起動は変更しない。
