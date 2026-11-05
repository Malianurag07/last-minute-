/**
 * Captures real app screens (demo web build) for the videos.
 * Usage: node videos/capture.mjs <appUrl> <outDir>
 * Needs the demo web build served at <appUrl> (npx expo export --platform web).
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(new URL('../node_modules/', import.meta.url));
const { chromium } = require('playwright');

const U = process.argv[2] ?? 'http://localhost:8099';
const OUT = process.argv[3] ?? 'videos/frames/screens';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.error('pageerror', e.message));
const wait = (ms = 600) => page.waitForTimeout(ms);
const click = async (t, exact = false) => { await page.getByText(t, { exact }).filter({ visible: true }).first().click(); await wait(800); };
const label = async (l) => { await page.getByLabel(l, { exact: true }).filter({ visible: true }).first().click(); await wait(700); };
const fill = async (ph, v) => { await page.getByPlaceholder(ph).filter({ visible: true }).first().fill(v); await wait(150); };
const pin = async (p) => { for (const d of p) { await page.getByTestId(`pin-${d}`).click(); await wait(90); } await wait(1000); };
const nav = async (path) => { await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path); await wait(1300); };
/** h = viewport height in CSS px (tall shots are panned in the video) */
const shot = async (name, h = 844) => {
  await page.setViewportSize({ width: 390, height: h });
  await wait(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(300);
  console.log('captured', name);
};
const logout = async () => { await nav('/settings'); await click('Log out'); };
const login = async (role, phone) => {
  await page.goto(`${U}/auth?role=${role}`, { waitUntil: 'networkidle' }); await wait(900);
  await fill('10-digit mobile number', phone); await label('Next'); await pin('2580');
};

await page.goto(`${U}/welcome`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(`${U}/welcome`, { waitUntil: 'networkidle' }); await wait(1500);
// follow ONE blouse order through the whole story: drop the pre-loaded demo blouse order
await page.getByText('English', { exact: true }).filter({ visible: true }).first().click(); await wait(800); // first change makes the app save its state
await page.evaluate(() => {
  const k = 'lastminute/v3';
  const s = JSON.parse(localStorage.getItem(k));
  s.orders = s.orders.filter((o) => o.id !== 'o-1001');
  localStorage.setItem(k, JSON.stringify(s));
});
await page.goto(`${U}/welcome`, { waitUntil: 'networkidle' }); await wait(1500);
await shot('01-welcome', 1100);

/* sign-up screens */
await click('I need something done');
await click('New here? Create account');
await shot('02-signup-details');
await fill('Your name', 'Ananya Iyer'); await fill('10-digit mobile number', '9876501234'); await label('Next');
await page.getByRole('checkbox').filter({ visible: true }).nth(0).click(); await page.getByRole('checkbox').filter({ visible: true }).nth(1).click(); await wait(400);
await shot('03-consent', 1300);
await label('I agree, send SMS code');
const code = (await page.getByText(/Demo SMS: your code is \d{6}/).first().textContent()).match(/\d{6}/)[0];
await fill('6-digit code', code.slice(0, 4));
await shot('04-otp');
await fill('6-digit code', code); await label('Next');
await page.getByTestId('pin-4').click(); await page.getByTestId('pin-8').click(); await wait(300);
await shot('05-pin');
await page.getByTestId('pin-2').click(); await page.getByTestId('pin-6').click(); await wait(800); await pin('4826');
await logout();

/* customer books (demo customer Priya) */
await login('customer', '9000012345');
await shot('10-home', 1750);
await click('Tailoring & Alterations'); await wait(800);
await shot('11-category', 1200);
await page.getByText("Kamala Aunty's Silai").filter({ visible: true }).first().click(); await wait(1300);
await shot('12-provider', 1750);
await click('Book now');
await fill('Sizes, colour', 'Bridal blouse, same size as old one. Party at 8 PM!');
await shot('13-booking', 2600);
await click('Place order'); await wait(1500);
await shot('14-order-requested', 1500);
await logout();

/* provider accepts and works */
await login('provider', '9820011111');
await shot('20-provider-home', 1700);
const orderCard = page.getByText('Bridal blouse').first();
await label('Accept'); await wait(1200);
await shot('21-provider-accepted', 1300);
await logout();

/* customer books pickup */
await login('customer', '9000012345');
await nav('/c/orders'); await page.getByText('Blouse stitching').filter({ visible: true }).first().click(); await wait(1200);
await shot('22-customer-book-pickup', 1700);
await page.getByLabel('Book on Rapido Parcel', { exact: true }).first().click().catch(async () => { await page.getByText(/^Book on /).filter({ visible: true }).first().click(); });
await wait(1200);
await logout();

/* provider: work → ready → send back → delivered */
await login('provider', '9820011111');
await nav('/p/jobs');
await page.getByText('Blouse stitching').filter({ visible: true }).first().click(); await wait(1200);
await shot('23-job-pickup', 1300);
await label('Start work'); await wait(900);
await shot('24-job-working', 1300);
await label('Work is ready'); await wait(900);
await label('Book rider to send back'); await wait(900);
await shot('25-job-ready-drop', 2200);
await page.getByText('Porter').filter({ visible: true }).first().click(); await wait(1200);
await label('Handed over'); await wait(1000);
await shot('26-job-delivered', 1600);
await nav('/p/dashboard');
await shot('27-dashboard', 1900);
await nav('/p/partners');
await shot('28-partners', 1700);
/* easy mode + Hindi for the partner video */
await nav('/settings');
await click('हिंदी'); await page.getByRole('switch').filter({ visible: true }).first().click(); await wait(600);
await nav('/p');
await shot('29-provider-easy-hindi', 1700);
await nav('/settings');
await click('English'); await page.getByRole('switch').filter({ visible: true }).first().click(); await wait(600);
await logout();

/* customer reviews */
await login('customer', '9000012345');
await nav('/c/orders'); await click('Past'); await page.getByText('Blouse stitching').filter({ visible: true }).first().click(); await wait(1200);
await page.getByLabel('5 stars', { exact: true }).first().click();
await fill('Say thanks or share feedback', 'Perfect fit, before the party!');
await shot('30-review', 1500);
await label('Submit review'); await wait(900);
await nav('/privacy');
await shot('31-privacy', 2400);
await logout();

/* new provider sign-up wizard */
await page.goto(`${U}/auth?role=provider&mode=signup`, { waitUntil: 'networkidle' }); await wait(900);
await fill('Your name', 'Shanti Devi'); await fill('10-digit mobile number', '9812345670'); await label('Next');
await page.getByRole('checkbox').filter({ visible: true }).nth(0).click(); await page.getByRole('checkbox').filter({ visible: true }).nth(1).click(); await label('I agree, send SMS code');
const code2 = (await page.getByText(/Demo SMS: your code is \d{6}/).first().textContent()).match(/\d{6}/)[0];
await fill('6-digit code', code2); await label('Next'); await pin('4826'); await pin('4826');
await wait(1000);
await label('Next');
await page.getByText('Cakes & Baking').filter({ visible: true }).first().click(); await wait(500);
await shot('40-join-category', 1400);
await label('Next');
await page.getByText('Birthday cake (1 kg)').first().click(); await page.getByText('Cupcakes (6 pcs)').first().click(); await wait(400);
await shot('41-join-services', 1300);

void orderCard;
await b.close();
console.log('done');
