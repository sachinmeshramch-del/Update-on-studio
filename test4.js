const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await new Promise(r => setTimeout(r, 4000));
  const html = await page.content();
  console.log("HTML length:", html.length);
  if (html.length < 1000) console.log(html);
  
  // also get the number of div elements
  const divCount = await page.evaluate(() => document.querySelectorAll('div').length);
  console.log("DIV count:", divCount);
  
  await browser.close();
})();
