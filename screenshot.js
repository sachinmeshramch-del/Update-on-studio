const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    await page.screenshot({ path: '/app/applet/screenshot.png' });
    await browser.close();
    console.log("Screenshot saved.");
  } catch (err) {
    console.error("Puppeteer script error:", err);
  }
})();
