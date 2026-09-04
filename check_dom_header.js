const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.includes('Active Source: none') ? 'Source None' : 'Source Something');
  console.log(text.includes('Mode: REAL') ? 'Mode: REAL' : 'Mode: DEMO');
  
  // also check connections API
  const res = await page.evaluate(async () => {
    return await fetch('/api/connections').then(r=>r.json());
  });
  console.log('Connections API:', res);
  await browser.close();
})();
