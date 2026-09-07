const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('response', response => {
    if (!response.ok()) console.log('PAGE RESPONSE ERROR:', response.status(), response.url());
  });

  await page.goto('https://ais-dev-gnqnk63aumy6v7ld4vi232-484384738446.asia-east1.run.app');
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
