import { chromium } from 'playwright';
const OUT = '/workspace/calorie-app/screenshots';
const B = 'http://localhost:4173/';
const browser = await chromium.launch();
const errors = [];
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${theme}: ${e.message}`));
  page.on('console', m => m.type() === 'error' && errors.push(`${theme} console: ${m.text()}`));
  const shot = async n => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${n}-${theme}.png` }); };
  await page.goto(B); await page.getByText('Get started').waitFor();
  await shot('01-onboarding-welcome');
  await page.getByText('Get started').click(); await shot('02-onboarding-about');
  await page.getByText('Continue').click(); await shot('03-onboarding-activity');
  await page.getByText('Continue').click();
  await page.getByText('Aggressive').click(); await shot('04-onboarding-goal');
  await page.getByText('Steady').click();
  await page.getByText('Continue').click(); await shot('05-onboarding-targets');
  await page.getByText('Start tracking').click(); await page.locator('.meal-head__title').first().waitFor();
  await shot('06-dashboard-empty');
  for (const [meal, q, g] of [['breakfast', 'greek yogurt', null], ['breakfast', 'banana', null], ['lunch', 'chicken breast', 180], ['lunch', 'brown rice', null]]) {
    await page.goto(`${B}#/log?meal=${meal}`);
    await page.getByPlaceholder('Search foods').fill(q);
    await page.locator('.list-item--button').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    const notes = await page.locator('.notice, .field__hint').allInnerTexts();
    const srcs = await page.locator('.list-item--button .badge').allInnerTexts();
    console.log(theme, q, '| sources:', [...new Set(srcs)].join(','), '| notices:', notes.join(' / ') || 'none');
    if (q === 'chicken breast') await shot('07-log-search');
    await page.locator('.list-item--button').first().click();
    if (g) { await page.locator('.sheet input').fill(String(g)); await shot('08-log-portion'); }
    await page.locator('.sheet .btn--primary').click();
    await page.locator('.meal-head__title').first().waitFor();
  }
  await page.waitForTimeout(2500);
  await shot('09-dashboard');
  await page.goto(`${B}#/log?meal=dinner`); await page.getByText('Recent').waitFor(); await shot('10-log-recent');
  await ctx.close();
}
await browser.close();
console.log(errors.filter(e=>!e.includes('Failed to load resource')).length ? errors.join('\n') : 'no errors');
