# macOS一般配布リリース（Developer ID・公証）— 準備状態と公開前確認

2026-11-17に、GitHub Releasesからの一般配布を目指し、**Developer ID署名・Apple公証・stapleまでを1回で再現できるパイプライン**を追加した。公開（ReleaseのPublish・リポジトリ可視化）は**所有者の明示的な確認が終わるまで行わない**。現状はDraft作成まで。

## パイプライン

```sh
npm run mac:release
```

1回の実行で次を行い、すべて成功しない限り成果物を配布可能としない。

1. 既存の全ゲート（`npm run check`・Swiftテスト×2・ビルド・自己テスト・スモーク・ZIP展開検証）を通過させるReleaseビルド（`scripts/build-macos.mjs --local-preview --developer-id`）
2. `Developer ID Application`証明書で**Secure Timestamp付きHardened Runtime署名**（アドホック代用禁止。証明書・Entitlements検査をスクリプト内で強制）
3. DMG生成（署名済みアプリ＋`/Applications`エイリアス＋READ-ME-FIRST.txt＋SHA256SUMS.txt）
4. `xcrun notarytool submit --keychain-profile kujira-release --wait` で公証（認証情報の作成・表示はしない）
5. `stapler staple` / `stapler validate`
6. 読み取り専用マウント → `codesign --verify --deep --strict` → `spctl --assess --type execute` → 自己テスト → DMG外へコピーして再検証
7. `SHA256SUMS.txt`・`release-notes.txt`・`release-manifest.json` 出力

成果物はGit対象外の `private-art/macos-out/<stamp>/`。DMG名は `KujiraWalkway-<version>-B19-arm64.dmg`。

## 個人用経路との分離

- 既存の `npm run mac:build -- --local-preview` / `--placeholder` と `npm run mac:dmg`（個人テスト用DMG）は**従来どおりアドホック署名**で不変。`build-dmg.mjs` の検証はDeveloper IDレポートを明示的に拒否し、逆もまたしかり。
- App Store / TestFlight 用の `Apple Distribution` 設定はこの経路では使わない。`--developer-id` は `Developer ID Application` のみを要求する。
- 旧個人用プレリリース `sparring-build19`（Prerelease）はそのまま。公開Releaseは別タグ・別名義にする。

## 公開前に所有者が確認すべきこと（未解決）

- **素材の再配布許諾**。`ART-LICENSE.md` 記載のとおり、キャラクター原案・生成・加工素材を**一般配布するMacアプリへ同梱する許諾は未確認**のまま。Web公開の可否とは別枠で、公開前に原案者・権利者への確認が必要。確認完了までReleaseはDraftのまま。
- 公開先リポジトリの方針（privateリポジトリのまま公開Releaseするか、公開専用リポジトリを別に作るか）。**既存privateリポジトリの可視性は勝手に変更しない。**
- 別Mac・新規ダウンロード環境でのGatekeeper初回起動試験（この環境では未実施）。

## 検証状況（2026-11-17）

- 実行済み: 公証`Accepted`・staple/validate・`hdiutil verify`・`shasum -c`・Gatekeeper`accepted source=Notarized Developer ID`・DMG内外での自己テスト・起動スモーク（壁紙OFF）・リモートDraft資産の再DL照合。成果物とSHA-256は`docs/current_status.md`と`release-manifest.json`。
- 未実施: 開発機以外での初回起動、実画面での壁紙/Space/スリープ受け入れ、公開後のRemote検証。
