/**
 * Renders a stage page frame-by-frame into an MP4 with music.
 *
 *   node videos/render.mjs <pitch|reel|partner> <out.mp4> [--fps 30] [--preview t1,t2,...]
 *
 * --preview writes PNG stills at the given seconds instead of a video.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../node_modules/', import.meta.url));
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const [name, outArg] = process.argv.slice(2);
const opt = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const fps = Number(opt('fps', 30));
const preview = opt('preview', null);
const out = resolve(outArg);
const size = name === 'pitch' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`file://${join(here, 'stage', `${name}.html`)}`);
await page.evaluate(() => window.ready());
const duration = await page.evaluate(() => window.DURATION);

if (preview) {
  for (const s of preview.split(',').map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.waitForTimeout(30);
    await page.screenshot({ path: out.replace(/\.png$/, '') + `-${String(s).padStart(5, '0')}.png` });
  }
  await browser.close();
  process.exit(0);
}

const total = Math.round(duration * fps);
const silent = out.replace(/\.mp4$/, '.silent.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const started = Date.now();
for (let f = 0; f < total; f++) {
  await page.evaluate((t) => window.render(t), f / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % (fps * 10) === 0) console.log(`${name}: ${(f / fps).toFixed(0)}s / ${duration}s  (${((Date.now() - started) / 1000).toFixed(0)}s elapsed)`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();

// music bed
const wav = out.replace(/\.mp4$/, '.wav');
execFileSync('python3', [join(here, 'music.py'), wav, String(duration + 0.5), name], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-af', 'volume=0.8', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
execFileSync('rm', ['-f', silent, wav]);
console.log(`done → ${out}`);
