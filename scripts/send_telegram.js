import fs from 'fs';
import { spawnSync } from 'child_process';

function sendJsonMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
  const res = spawnSync('curl', ['-s', '-X', 'POST', url, '-H', 'Content-Type: application/json', '-d', body], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error('curl failed: ' + res.stderr);
  }
  const out = res.stdout || '';
  try {
    const j = JSON.parse(out);
    if (!j.ok) throw new Error('Telegram sendMessage failed: ' + out);
    return j;
  } catch (e) {
    throw new Error('Invalid JSON response from Telegram: ' + out);
  }
}

function sendPhotoViaCurl(token, chatId, filePath, caption) {
  // 使用 curl -F 上传图片
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const args = ['-s', '-X', 'POST', url, '-F', `chat_id=${chatId}`, '-F', `caption=${caption}`, '-F', `photo=@${filePath}`];
  const res = spawnSync('curl', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error('curl sendPhoto failed:', res.stderr);
    return { ok: false, error: res.stderr };
  }
  try {
    const j = JSON.parse(res.stdout || '');
    return j;
  } catch (e) {
    console.error('Invalid JSON from sendPhoto:', res.stdout);
    return { ok: false, error: res.stdout };
  }
}

(async () => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const resultsFile = process.env.RESULTS_FILE || 'results.json';

    if (!token || !chatId) {
      console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in env');
      process.exit(1);
    }

    if (!fs.existsSync(resultsFile)) {
      console.error('Results file not found:', resultsFile);
      process.exit(1);
    }

    const raw = fs.readFileSync(resultsFile, 'utf8');
    const results = JSON.parse(raw);

    let summary = `<b>WebHostMost AutoLogin Run</b>\n`;
    summary += `Time: ${results.run_at || new Date().toISOString()}\n`;
    summary += `Overall: ${results.overall_success ? '✅ SUCCESS' : '❌ SOME FAILED'}\n\n`;

    const accounts = results.accounts || {};
    const total = Object.keys(accounts).length;
    summary += `Accounts: ${total}\n\n`;

    for (const [username, info] of Object.entries(accounts)) {
      const status = info.success ? '✅' : '❌';
      const msg = info.message ? ` - ${info.message}` : '';
      summary += `${status} <code>${username}</code>${msg}\n`;
    }

    if (results.error) {
      summary += `\nError: ${results.error}\n`;
    }

    // 先发送文字摘要（以 HTML 格式）
    console.log('Sending summary to Telegram...');
    sendJsonMessage(token, chatId, summary);
    console.log('Summary sent.');

    // 然后发送每个账号的截图（如果存在）
    console.log('Sending screenshots (if any)...');
    for (const [username, info] of Object.entries(accounts)) {
      if (info && info.screenshot) {
        const filePath = info.screenshot;
        if (fs.existsSync(filePath)) {
          const caption = `${info.success ? '✅' : '❌'} ${username} - ${info.message || ''}`;
          console.log(`Uploading screenshot for ${username}: ${filePath}`);
          const r = sendPhotoViaCurl(token, chatId, filePath, caption);
          if (r && r.ok) {
            console.log(`Uploaded ${filePath} successfully.`);
          } else {
            console.error(`Failed to upload ${filePath}:`, r);
          }
        } else {
          console.log(`Screenshot file not found for ${username}: ${filePath}`);
        }
      }
    }

    console.log('All done.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to send Telegram notification:', err);
    process.exit(1);
  }
})();
