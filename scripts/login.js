const puppeteer = require ('puppeteer/lib/cjs/puppeteer');
const fs = require('fs');
const path = require('path');

function safeFilename(name) {
  return name.replace(/[^a-z0-9_\-\.]/gi, '_');
}

async function login(username, password) {
  console.log(`Attempting to login with username: ${username}`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const result = {
    username,
    success: false,
    message: '',
    screenshot: null
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto('https://client.webhostmost.com/login', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('#inputEmail', { timeout: 10000 });
    await page.type('#inputEmail', username);
    await page.type('#inputPassword', password);

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    ]);

    const url = page.url();
    if (url.includes('clientarea.php')) {
      console.log(`✅ Successfully logged in as ${username}`);
      result.success = true;
      result.message = 'Login successful';
    } else {
      console.log(`❌ Failed to login as ${username}`);
      result.success = false;
      result.message = `Unexpected URL after login: ${url}`;
    }

    // 保存截图到 screenshots 文件夹
    const screenshotsDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    const filename = `${safeFilename(username)}-${Date.now()}.png`;
    const filepath = path.join(screenshotsDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    result.screenshot = filepath;

  } catch (error) {
    console.error(`🚨 Error during login for ${username}:`, error);
    result.success = false;
    result.message = `Error: ${error.message || error}`;
    // 尝试记录错误页面截图（如果可能）
    try {
      const screenshotsDir = path.join(process.cwd(), 'screenshots');
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
      const filename = `${safeFilename(username)}-${Date.now()}-error.png`;
      const filepath = path.join(screenshotsDir, filename);
      // 没有 page 可用在这里忽略
      result.screenshot = filepath;
    } catch (e) {
      // ignore
    }
  } finally {
    await browser.close();
    return result;
  }
}

async function main() {
  try {
    const credentialsJson = process.env.USERNAME_AND_PASSWORD;
    if (!credentialsJson) {
      throw new Error('No credentials provided. Please set USERNAME_AND_PASSWORD secret.');
    }

    const accounts = JSON.parse(credentialsJson);
    if (!accounts || Object.keys(accounts).length === 0) {
      throw new Error('Parsed USERNAME_AND_PASSWORD is empty or invalid JSON.');
    }

    console.log(`Found ${Object.keys(accounts).length} accounts to process`);

    const results = {
      run_at: new Date().toISOString(),
      overall_success: true,
      accounts: {}
    };

    for (const [username, password] of Object.entries(accounts)) {
      try {
        console.log(`\n=== Processing account: ${username} ===`);
        const res = await login(username, password);
        results.accounts[username] = res;
        if (!res.success) results.overall_success = false;

        // 账户间延迟
        if (Object.keys(accounts).length > 1) {
          console.log('Waiting 5 seconds before next account...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`Error processing ${username}:`, error);
        results.accounts[username] = {
          username,
          success: false,
          message: `Unhandled error: ${error.message || error}`,
          screenshot: null
        };
        results.overall_success = false;
      }
    }

    // 写入 results.json
    fs.writeFileSync('results.json', JSON.stringify(results, null, 2), 'utf8');
    console.log('\nAll accounts processed!');
    console.log('Results written to results.json');

    // 不强制退出非零，以确保后续步骤（通知）总能执行
  } catch (error) {
    console.error('Fatal error:', error);
    try {
      const r = {
        run_at: new Date().toISOString(),
        overall_success: false,
        error: String(error),
        accounts: {}
      };
      fs.writeFileSync('results.json', JSON.stringify(r, null, 2), 'utf8');
    } catch (e) {}
  }
}

main().catch(console.error);
