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

## 公開前の確認事項（2026-11-17更新）

- **素材の再配布許諾**: 2026-11-17にプロジェクト所有者が「素材及び生成素材の許諾は問題なし」と確認済み。公開配布のブロッカーは解消した（`ART-LICENSE.md`の歴史的記述は参照として残る）。
- 公開先: 所有者方針で現行privateリポジトリのまま。**注意: GitHub Releasesはリポジトリの可視性を継承するため、privateのまま公開Releaseを発行しても一般ユーザーはダウンロードできない**。一般配布には①リポジトリのpublic化、または②公開専用リポジトリ／別ホストへの成果物公開が必要。可視性変更は所有者の明示指示待ち。
- **Bundle ID `local.kujira.walkway`** を公開後も継続するか要確認。変更するなら公開前（発行後は設定ファイル`~/Library/Preferences/local.kujira.walkway.plist`の引き継ぎ問題が出る）。
- 別Mac・新規ダウンロード環境でのGatekeeper初回起動試験は**2026-11-17にユーザーの実機確認で「問題なし」**。

## レビュー対応（2026-11-17）

- ビルド番号は`scripts/build-info.mjs`の`BUNDLE_BUILD`単一定義へ集約（`build-macos.mjs`/`release-macos.mjs`が参照。個人用`build-dmg.mjs`はBuild19個人用固定のまま）。
- DMGからコピー出したアプリへの`spctl --assess --type execute`（Gatekeeper判定）をパイプラインに追加。
- READMEの「お蔵入り」説明をBuild 19の実態に整合。
- `allow-jit`検証: entitlementsなしで再署名したコピーで`--self-test`成功（インタプリタフォールバック）。ただしJSCのJIT起動はOS・実行時間依存のため、長時間壁紙動作でのW^Xクラッシュ回避に**`allow-jit`維持**が安全（最小限で公証も通過）。

## 検証状況（2026-11-17）

- 実行済み: 公証`Accepted`・staple/validate・`hdiutil verify`・`shasum -c`・Gatekeeper`accepted source=Notarized Developer ID`・DMG内外での自己テスト・起動スモーク（壁紙OFF）・リモートDraft資産の再DL照合。成果物とSHA-256は`docs/current_status.md`と`release-manifest.json`。
- 未実施（残）: 実画面での壁紙/Space/スリープ受け入れ・長時間負荷（任意）、公開後のRemote検証。実機初回起動はユーザー確認済み。
