import { chromium } from 'playwright';

const BASE = 'http://localhost:3001';
const pages = [
  { name: 'Dashboard', path: '/' },
  { name: 'Sessions', path: '/sessions' },
  { name: 'Providers', path: '/providers' },
  { name: 'MCP Servers', path: '/mcp-servers' },
  { name: 'Skills', path: '/skills' },
  { name: 'Settings', path: '/settings' },
];

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  let failures = 0;

  for (const { name, path } of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    try {
      const response = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });

      // Wait a bit for React to render and polling to fire
      await page.waitForTimeout(3000);

      // Check for JS errors
      if (errors.length > 0) {
        console.log(`FAIL  ${name} (${path})`);
        for (const e of errors) console.log(`      JS Error: ${e}`);
        failures++;
      } else {
        // Check page has actual content (not blank)
        const bodyText = await page.locator('body').innerText();
        const hasContent = bodyText.trim().length > 10;

        // Check for error banners in the UI
        const errorBanner = await page.locator('.error-banner').count();

        if (!hasContent) {
          console.log(`FAIL  ${name} (${path}) — blank page`);
          failures++;
        } else if (errorBanner > 0) {
          const errText = await page.locator('.error-banner').first().innerText();
          console.log(`FAIL  ${name} (${path}) — error banner: ${errText.substring(0, 120)}`);
          failures++;
        } else {
          console.log(`OK    ${name} (${path})`);
        }
      }
    } catch (err) {
      console.log(`FAIL  ${name} (${path}) — ${err.message.substring(0, 120)}`);
      failures++;
    }
    await page.close();
  }

  await browser.close();

  console.log(`\n${pages.length - failures}/${pages.length} pages OK`);
  if (failures > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
