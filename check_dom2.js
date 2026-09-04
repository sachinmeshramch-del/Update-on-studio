const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    
    const html = await page.evaluate(() => document.body.innerHTML);
    console.log("DOM HAS HEADER?", html.includes('Gold Swing AI Pro'));
    console.log("DOM HAS SIGNAL PANEL?", html.includes('Failed to load scalp signal') || html.includes('HOLD') || html.includes('BULLISH'));
    console.log("DOM HAS CHART?", html.includes('XAUUSD Live Chart'));
    
    await browser.close();
  } catch (err) {
    console.error("Puppeteer script error:", err);
  }
})();
