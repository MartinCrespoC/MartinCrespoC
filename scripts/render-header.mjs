/**
 * Nebula Cosmica — animated header renderer.
 *
 * Captures the canvas particle engine (assets/web/header-anim.html) frame
 * by frame with headless Chromium and compiles an animated WebP with
 * ffmpeg. The frame sequence is played as a palindrome (0..N..1) so the
 * WebP loops seamlessly forever. Every render produces a brand-new random
 * constellation — the daily CI run makes the profile header change daily.
 *
 * Usage: node scripts/render-header.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAMES = 96;
const STEP_MS = 66.7; // 15 fps
const OUT = path.join(ROOT, 'assets', 'header.webp');
const TMP = path.join(ROOT, 'frames_header');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 300 } });
await page.goto('file://' + path.join(ROOT, 'assets', 'web', 'header-anim.html') + '?manual=1');
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.__step(1500)); // warm-up: let the field spread

for (let i = 0; i < FRAMES; i++) {
  await page.evaluate((dt) => window.__step(dt), STEP_MS);
  await page.screenshot({ path: path.join(TMP, `f${String(i).padStart(3, '0')}.png`) });
}
await browser.close();

/* palindrome sequence: 0..N-1 then N-2..1 → seamless loop */
const seq = [];
for (let i = 0; i < FRAMES; i++) seq.push(i);
for (let i = FRAMES - 2; i > 0; i--) seq.push(i);
const frameFiles = seq.map((i) => path.join(TMP, `f${String(i).padStart(3, '0')}.png`));

const LOCAL_IMG2WEBP = 'E:\\tools\\libwebp\\libwebp-1.4.0-windows-x64\\bin\\img2webp.exe';
const IMG2WEBP = process.env.IMG2WEBP
  || (fs.existsSync(LOCAL_IMG2WEBP) ? LOCAL_IMG2WEBP : 'img2webp');

execFileSync(IMG2WEBP, [
  '-loop', '0',
  '-lossy', '-q', '78', '-m', '6',
  '-d', String(Math.round(STEP_MS)),
  '-o', OUT,
  ...frameFiles,
], { stdio: ['ignore', 'ignore', 'inherit'] });

fs.rmSync(TMP, { recursive: true, force: true });
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`header.webp rendered: ${FRAMES} frames, palindrome loop, ${kb} KB`);
