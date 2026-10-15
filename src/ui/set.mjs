import { chromium } from 'playwright';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
p.on('pageerror',e=>console.log('ERR',e.message)); await p.goto('http://localhost:4173/'); await p.getByText('Get started').click();
for (let i=0;i<3;i++) await p.getByText('Continue').click(); await p.getByText('Start tracking').click();
await p.locator('.meal-head__title').first().waitFor(); await p.goto('http://localhost:4173/#/settings'); await p.waitForTimeout(500); await p.screenshot({path:'/tmp/s.png'}); await p.getByPlaceholder('Paste your key').fill('TESTKEY123'); await p.getByRole('button',{name:'Save'}).click();
await p.waitForTimeout(500); await p.reload(); await p.waitForTimeout(800);
console.log('persisted:', await p.getByPlaceholder('Paste your key').inputValue());
await p.screenshot({ path: '/workspace/calorie-app/screenshots/11-settings-light.png' });
await b.close();
