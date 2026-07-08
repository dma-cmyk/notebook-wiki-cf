# notebook-wiki-cf (LLM Wiki Serverless) 🚀

Cloudflare Pages + Cloudflare R2 で動作する、完全サーバーレス・永続無料のセキュアなノート型個人Wiki（LLM Wiki）です。

## 💠 特徴
- **完全サーバーレス**: 自宅PCなどの常時起動サーバーは不要。Cloudflare Pages上で完全に稼働します。
- **費用 \$0 / 永久無料**: Cloudflare Pages と R2 の無料枠（10 GBストレージ、月1000万回読み込み、月100万回書き込み）の範囲内で完全に無料で運用可能。
- **堅牢なセキュリティ**:
  - TOTP（二要素認証）によるセキュアなログイン。
  - メモおよびアップロードされたファイル（画像、音声、動画）は、ログインパスフレーズから導出したマスターキー（AES-256-CBC）を用いてすべて暗号化された状態でR2ストレージに保存されます。
- **Gemini AI連携**:
  - メモの内容に基づいた自動タグ付け＆バックリンク自動生成によるナレッジグラフ。
  - ノート全体の内容を把握した対話型「AI検索チャット」機能。

## 📦 技術スタック
- **フロントエンド**: React 19, Vite 6, TypeScript
- **バックエンド**: Express.js, `cloudflare:node` (httpServerHandler)
- **インフラ/ストレージ**: Cloudflare Pages, Cloudflare R2

## 🛠️ ローカル開発手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. ローカル開発サーバー（フロントエンドのみ）
```bash
npm run dev
```

### 3. Cloudflare Pagesローカルエミュレーター（バックエンド+フロントエンド）
ローカルのWranglerを使って、Cloudflare環境をシミュレートしながら起動します。
```bash
npm run dev:cf
```

## 🚀 デプロイと運用
本リポジトリは GitHub 連携により Cloudflare Pages と紐付けられています。

```bash
git add .
git commit -m "update message"
git push origin main
```
上記の通り `main` ブランチにプッシュするだけで、Cloudflare Pages 上で自動ビルド（`npm run build`）が走り、数分で最新バージョンにアップデートされます。

## 📝 ライセンス
SPDX-License-Identifier: Apache-2.0
