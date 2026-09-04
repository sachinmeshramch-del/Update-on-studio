const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  const bounding = await page.evaluate(() => {
    const root = document.getElementById('root');
    const kids = Array.from(root.children).map(c => ({ tag: c.tagName, width: c.offsetWidth, height: c.offsetHeight }));
    return { rootHeight: root.offsetHeight, kids };
  });
  console.log(bounding);
  await browser.close();
})();
