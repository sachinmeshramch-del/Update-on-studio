const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    
    const html = await page.evaluate(() => document.body.innerHTML);
    console.log("BODY HTML:", html.length > 500 ? html.substring(0, 500) + '...' : html);
    
    await browser.close();
  } catch (err) {
    console.error("Puppeteer script error:", err);
  }
})();
