# CIの実行範囲

`.github/workflows/check.yml` は `main` へのpush時だけ実行する。PRの作成・更新や作業ブランチへのpushでは実行しない。

- Markdown、`.claude/`、`.agents/`、`.codex/` だけの変更ではワークフローを起動しない。`docs/` はタワーのテストが読む `docs/animation-repair-audit.json` だけを判定し、ほかは検証しない。
- `main` へのpush直前と直後のコミットを比較し、push内の全コミットの変更を判定する。削除・移動前のパスも判定に含める。
- ゲーム固有の変更では、そのゲームの既存ユニットテスト・契約テストを実行し、変更していないゲームの検証は実行しない。タワーの変更では既存のPagesブラウザテスト、予測検証、オフラインbotテストも実行する。ゲーム専用のVite・Playwright設定や素材加工スクリプトもそのゲームの変更として扱う。
- 別のゲームのコードや素材を使うゲームは、使われる側の変更でも検証する。Ember Gridはタワーの `src/game/`・`src/progression/`・`src/rendering/` と `public/tower-defense-art/`、人生サバイバーはウサギの `src/network.ts`、トップページはタワーのモデルビューワーとポートレート画像を使う。`tests/ci-scope.test.mjs` が各ゲームのimportをたどり、使う側を選ばないファイルがあれば失敗する。
- Ember Gridの変更では専用の型チェックと既存のPagesブラウザテストも実行する。
- トップページの変更ではカタログテストとトップページのブラウザテストだけを選ぶ。
- botだけ・デバッグツールだけの変更では専用の検証だけを実行し、ゲームの検証・Pages公開は実行しない。
- テストの選び方・配分だけを決めるファイル（`scripts/ci-scope.mjs`、`tests/ci-scope.test.mjs`、`scripts/ci-pages-shard.mjs`、`scripts/ci-pages-weights.json`、`scripts/vitest-unit-weights.json`、描画ベンチマークのworkflow）だけの変更では、CIの契約テストだけを実行し、ゲームの検証・Pages公開は実行しない。
- Pagesのビルドは変更判定と並行して始め、公開対象がない変更（botだけ・デバッグツールだけ・CIの選び方だけなど）では公開しない。
- 共通コード、依存関係、`check.yml`、Chromium導入、テストランナー設定、未分類ファイルの変更では全体を検証する。

型チェック・lintは共通の既存コマンドを使う。公開対象が変わる場合のPagesビルドはサイト全体で行い、出力とライセンス通知の検証を維持する。選択された検証の失敗・キャンセル時には公開しない。変更範囲に含まれない検証のskipは公開を妨げない。

実行範囲の定義は `scripts/ci-scope.mjs`。変更時は次で判定とワークフローの契約を検証する。

```sh
node --test tests/ci-scope.test.mjs
```
