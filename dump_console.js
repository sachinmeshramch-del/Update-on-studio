const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    page.on('response', response => {
      if (!response.ok()) {
        console.log('BAD RESPONSE:', response.status(), response.url());
      }
    });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    await browser.close();
  } catch (err) {
    console.error("Puppeteer script error:", err);
  }
})();
