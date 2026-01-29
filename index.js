const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();

const TARGET_URL = 'https://information-b.vercel.app/';
const KEYWORD = 'カルア';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// トライアル開始日（YYYY-MM-DD形式）環境変数から取得
// 例: 2025-11-06
const TRIAL_START_DATE = process.env.TRIAL_START_DATE || null;

// 前回の状態を保存（キーワードが見つかった状態を記録）
let lastFoundKeyword = false;

// 最後に通知を送信した時刻（12時間の休止期間用）
let lastNotificationTime = null;

// トライアル期限チェックを実行した日付（1日1回のみチェック）
let lastTrialCheckDate = null;

// 毎日1回トライアル期限をチェック（14:00に実行）
async function checkAndNotifyTrialExpiry() {
  const japanTime = getJapanTime();
  const today = japanTime.toISOString().split('T')[0]; // YYYY-MM-DD

  // 今日すでにチェック済みならスキップ
  if (lastTrialCheckDate === today) {
    return;
  }

  // 14時台のみ実行
  const hour = japanTime.getHours();
  if (hour !== 14) {
    return;
  }

  const trialInfo = checkTrialRemaining();
  if (!trialInfo) {
    return; // トライアル開始日が設定されていない
  }

  const { diffDays, remainingDays } = trialInfo;

  console.log(`[${new Date().toISOString()}] トライアル期限チェック: 開始から${diffDays}日経過、残り${remainingDays}日`);

  // 30日、27日、23日に通知
  if (remainingDays === 0 || remainingDays === 3 || remainingDays === 7) {
    await sendTrialExpiryNotification(remainingDays);
    lastTrialCheckDate = today; // 今日のチェック完了
  }
}

// 日本時間を取得する関数
function getJapanTime() {
  const now = new Date();
  // UTCから日本時間(+9時間)に変換
  const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return japanTime;
}

// 監視時間帯かどうかをチェック（14時～20時）
function isMonitoringTime() {
  const japanTime = getJapanTime();
  const hour = japanTime.getHours();
  return hour >= 14 && hour < 20;
}

// 通知クールダウン中かチェック（最後の通知から12時間以内か）
function isInCooldown() {
  if (!lastNotificationTime) {
    return false; // まだ一度も通知していない
  }
  const now = Date.now();
  const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12時間 = ミリ秒
  return (now - lastNotificationTime) < twelveHoursInMs;
}

// トライアル期間の残り日数をチェック
function checkTrialRemaining() {
  if (!TRIAL_START_DATE) {
    return null; // トライアル開始日が設定されていない
  }

  try {
    const startDate = new Date(TRIAL_START_DATE);
    const now = new Date();
    const diffTime = now - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const remainingDays = 30 - diffDays;

    return { diffDays, remainingDays };
  } catch (error) {
    console.error('トライアル開始日の解析エラー:', error);
    return null;
  }
}

// トライアル期限切れ通知を送信
async function sendTrialExpiryNotification(remainingDays) {
  if (!DISCORD_WEBHOOK_URL) {
    return;
  }

  let title, message, color;

  if (remainingDays === 0) {
    title = '🚨 Railway.app トライアル期限切れ';
    message = '本日でトライアル期間が終了します。サービスを継続する場合は、Hobby Planにアップグレードしてください。';
    color = 0xff0000; // 赤色
  } else if (remainingDays === 3) {
    title = '⚠️ Railway.app トライアル残り3日';
    message = 'トライアル期間の終了まで残り3日です。継続する場合は、Hobby Planへのアップグレードをご検討ください。';
    color = 0xffa500; // オレンジ色
  } else if (remainingDays === 7) {
    title = '📢 Railway.app トライアル残り7日';
    message = 'トライアル期間の終了まで残り1週間です。';
    color = 0xffff00; // 黄色
  } else {
    return; // 通知不要
  }

  const upgradeUrl = 'https://railway.app/account/billing';

  const webhookMessage = {
    content: '@everyone',
    embeds: [{
      title: title,
      color: color,
      fields: [
        {
          name: '残り日数',
          value: `${remainingDays}日`,
          inline: true
        },
        {
          name: '現在のプラン',
          value: 'Trial Plan（無料）',
          inline: true
        },
        {
          name: 'アップグレード方法',
          value: `1. [Railway.app Billing](${upgradeUrl}) にアクセス\n2. 「Unlock Hobby Plan」をクリック\n3. クレジットカード情報を入力\n\n**Hobby Plan: 月額$5（約750円）**`,
          inline: false
        },
        {
          name: '💡 お知らせ',
          value: message,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'カルア監視システム'
      }
    }]
  };

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookMessage)
    });

    if (response.ok) {
      console.log(`[${new Date().toISOString()}] 📢 トライアル期限通知送信成功（残り${remainingDays}日）`);
    } else {
      console.error(`[${new Date().toISOString()}] トライアル期限通知送信失敗:`, response.statusText);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] トライアル期限通知エラー:`, error.message);
  }
}

// Webサイトを監視する関数
async function checkWebsite() {
  const startTime = Date.now();
  const japanTime = getJapanTime();
  console.log(`[${new Date().toISOString()}] 監視チェック開始... (日本時間: ${japanTime.toLocaleString('ja-JP')})`);
  
  // トライアル期限チェック（毎日14時に1回）
  await checkAndNotifyTrialExpiry();
  
  // 監視時間帯チェック（14時～18時）
  if (!isMonitoringTime()) {
    const hour = japanTime.getHours();
    console.log(`[${new Date().toISOString()}] ⏸️  監視時間外です（現在: ${hour}時）監視スキップ`);
    return;
  }

  // 通知クールダウンチェック（12時間）
  if (isInCooldown()) {
    const timeSinceLastNotification = Math.floor((Date.now() - lastNotificationTime) / 1000 / 60);
    const remainingMinutes = 720 - timeSinceLastNotification; // 720分 = 12時間
    console.log(`[${new Date().toISOString()}] 😴 通知クールダウン中（残り約${remainingMinutes}分）監視スキップ`);
    return;
  }

  console.log(`[${new Date().toISOString()}] ✅ 監視時間内 & クールダウン終了 → 監視開始`);
  
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
      // 通知を送信したので、クールダウンタイマーを開始
      lastNotificationTime = Date.now();
      console.log(`[${new Date().toISOString()}] 🔔 通知送信完了 → 12時間の休止期間開始`);
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
console.log(`チェック間隔: 1分おき`);
console.log(`監視時間帯: 毎日14:00～20:00（日本時間）`);
console.log(`通知後の休止: 12時間`);
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
