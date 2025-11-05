# カルア自動監視システム

JavaScriptレンダリング対応のWebサイト監視システム。
1分おきに https://information-b.vercel.app/ をチェックし、「カルア」が表示されたらDiscordに通知します。

## 機能

- ✅ 1分おき自動実行
- ✅ Puppeteerによる完全JavaScriptレンダリング
- ✅ Discord Webhook通知
- ✅ メモリ・ネットワーク最適化
- ✅ 重複通知防止機能

## セットアップ

### ローカルテスト

```bash
# 依存関係をインストール
npm install

# 環境変数を設定
cp .env.example .env
# .envファイルを編集してDiscord Webhook URLを設定

# 起動
npm start
```

### Railway.appへのデプロイ

1. GitHubリポジトリを作成してプッシュ
2. Railway.appでプロジェクト作成
3. GitHubリポジトリを接続
4. 環境変数 `DISCORD_WEBHOOK_URL` を設定
5. デプロイ完了！

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL | ✅ 必須 |

## コスト最適化

- ブラウザを毎回開閉してメモリリーク防止
- 画像・CSS・フォントをブロックしてネットワーク削減
- タイムアウト10秒設定
- 重複通知防止ロジック

## 予想コスト（Railway.app）

- 通常: $10〜$15/月（1,500〜2,250円）
- Hard Limit設定推奨: $65（9,750円）

## ライセンス

MIT
