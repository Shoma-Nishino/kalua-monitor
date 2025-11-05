const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();

const TARGET_URL = 'https://information-b.vercel.app/';
const KEYWORD = 'カルア';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// 前回の状態を保存（キーワードが見つかった状態を記録）
let lastFoundKeyword = false;

// Webサイトを監視する関数
async function checkWebsite() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] 監視開始...`);

  let browser = null;

  try {
    // Puppeteerブラウザを起動（メモリ最適化オプション付き）
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // メモリ使用量削減
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // ページサイズを小さく設定してメモリ節約
    await page.setViewport({ width: 1280, height: 720 });

    // 不要なリソースをブロックしてネットワーク使用量削減
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // 画像、フォント、スタイルシートをブロック（必要に応じて調整）
      if (['image', 'stylesheet', 'font'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // ページにアクセス（タイムアウト10秒）
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 10000
    });

    // JavaScriptレンダリングを待機（最大3秒）
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ページの全テキストを取得
    const bodyText = await page.evaluate(() => document.body.innerText);

    // キーワードが含まれているかチェック
    const keywordFound = bodyText.includes(KEYWORD);

    const elapsedTime = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] 監視完了（${elapsedTime}ms）`);
    console.log(`キーワード「${KEYWORD}」: ${keywordFound ? '✅ 発見' : '❌ 未検出'}`);

    // キーワードが新たに見つかった場合のみ通知（連続通知を防ぐ）
    if (keywordFound && !lastFoundKeyword) {
      await sendDiscordNotification(bodyText);
      lastFoundKeyword = true;
    } else if (!keywordFound) {
      lastFoundKeyword = false;
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] エラー発生:`, error.message);
  } finally {
    // ブラウザを必ず閉じる（メモリリーク防止）
    if (browser) {
      await browser.close();
    }
  }
}

// Discord通知を送信する関数
async function sendDiscordNotification(bodyText) {
  if (!DISCORD_WEBHOOK_URL) {
    console.error('Discord Webhook URLが設定されていません');
    return;
  }

  // LINEで共有するメッセージを作成
  const lineMessage = `🎉 カルアが検出されました！\n${TARGET_URL}`;
  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(lineMessage)}`;

  const message = {
    content: `🎉 キーワード「${KEYWORD}」を検出しました！`,
    embeds: [{
      title: '🔔 カルア検出通知',
      url: TARGET_URL,
      color: 0x00ff00, // 緑色
      fields: [
        {
          name: '検出時刻',
          value: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
          inline: true
        },
        {
          name: 'URL',
          value: TARGET_URL,
          inline: false
        },
        {
          name: '📱 LINEで共有',
          value: `[ここをタップしてLINEで共有](${lineShareUrl})`,
          inline: false
        },
        {
          name: 'ページ内容（抜粋）',
          value: bodyText.substring(0, 500) + '...',
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    if (response.ok) {
      console.log(`[${new Date().toISOString()}] Discord通知送信成功`);
    } else {
      console.error(`[${new Date().toISOString()}] Discord通知送信失敗:`, response.statusText);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Discord通知エラー:`, error.message);
  }
}

// アプリケーション起動
console.log('=================================================');
console.log('🚀 カルア監視システム起動');
console.log('=================================================');
console.log(`監視対象: ${TARGET_URL}`);
console.log(`検索キーワード: ${KEYWORD}`);
console.log(`実行間隔: 1分おき`);
console.log('=================================================\n');

// 起動時に1回実行
checkWebsite();

// 1分おきに実行（cron式: */1 * * * * = 毎分）
cron.schedule('*/1 * * * *', () => {
  checkWebsite();
});

// アプリケーションを永続的に実行
process.on('SIGTERM', () => {
  console.log('SIGTERMを受信。プロセスを終了します。');
  process.exit(0);
});
