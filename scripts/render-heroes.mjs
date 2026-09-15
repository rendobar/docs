#!/usr/bin/env node
/**
 * Renders the 2400x900 hero images for the Automation pages.
 *
 * The Storage heroes were drawn by hand, so a copy change meant redrawing one.
 * These come from one HTML template rendered by headless Chrome, which keeps
 * every hero on the same grid, glow and type, and makes a caption edit a
 * one-line change here followed by a re-run.
 *
 *   node scripts/render-heroes.mjs
 *
 * Needs Chrome or Edge. Set CHROME to the binary if it is not found.
 * The Rendobar mark and the Geist font load over the network while rendering.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'images', 'automation');

const logo = (name) => readFileSync(join(ROOT, 'images', 'logos', `${name}.svg`), 'utf8');

// Make's purple sits too close to the dark tile to read, so its mark is drawn
// in the tile's light ink and the brand colour carries the glow instead.
const TILES = {
  n8n: { svg: logo('n8n'), glow: '234, 75, 113' },
  activepieces: { svg: logo('activepieces'), glow: '129, 66, 227' },
  make: { svg: logo('make').replace('fill="#6D00CC"', 'fill="#F2F5F3"'), glow: '109, 0, 204' },
  zapier: { svg: logo('zapier'), glow: '255, 79, 0' },
};

const HEROES = [
  {
    file: 'hero-overview.png',
    tiles: ['n8n', 'activepieces', 'make', 'zapier'],
    caption: 'n8n and Activepieces today, Make and Zapier soon',
  },
  { file: 'hero-n8n.png', tiles: ['n8n'], caption: 'A verified node for n8n Cloud and self-hosted n8n' },
  {
    file: 'hero-activepieces.png',
    tiles: ['activepieces'],
    caption: 'Flows pause on a waitpoint until the job finishes',
  },
];

function page({ tiles, caption }) {
  const tileHtml = tiles
    .map((name) => {
      const t = TILES[name];
      return `<div class="tile" style="--glow:${t.glow}">${t.svg}</div>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&display=block">
<style>
  html, body { margin: 0; width: 2400px; height: 900px; overflow: hidden; }
  body {
    background:
      radial-gradient(900px 520px at 50% 44%, rgba(16, 185, 129, 0.11), transparent 70%),
      #0a0b0b;
    font-family: Geist, system-ui, sans-serif;
    display: grid; place-items: center;
  }
  body::before {
    content: ""; position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(1100px 620px at 50% 45%, #000 30%, transparent 80%);
  }
  .stage { position: relative; display: grid; justify-items: center; gap: 120px; margin-top: 40px; }
  .row { display: flex; align-items: center; gap: 72px; }
  .mark {
    width: 300px; height: 300px; border-radius: 68px; display: grid; place-items: center;
    background: linear-gradient(160deg, #191c1b, #0f1110);
    border: 1px solid rgba(52, 211, 153, 0.16);
    box-shadow: 0 0 90px rgba(16, 185, 129, 0.14), inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .mark img { width: 162px; height: 162px; }
  .links { display: grid; gap: 34px; width: 460px; color: #8f9894; font-size: 30px; text-align: center; }
  .link { display: grid; gap: 14px; }
  .link svg { width: 100%; height: 18px; overflow: visible; }
  .tiles { display: flex; gap: 28px; }
  .tile {
    width: 206px; height: 206px; border-radius: 48px; display: grid; place-items: center;
    background: linear-gradient(160deg, #191c1b, #0f1110);
    border: 1px solid rgba(var(--glow), 0.30);
    box-shadow: 0 0 70px rgba(var(--glow), 0.20), inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .tile svg { width: 104px; height: 104px; }
  .caption { color: #b9c0bd; font-size: 46px; letter-spacing: -0.01em; }
</style></head><body>
<div class="stage">
  <div class="row">
    <div class="mark"><img src="https://cdn.rendobar.com/assets/brand/logo-mark.svg" alt=""></div>
    <div class="links">
      <div class="link"><span>submit</span>
        <svg viewBox="0 0 460 18"><path d="M8 9H452M8 9l14-8M8 9l14 8" stroke="rgba(52,211,153,0.65)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg></div>
      <div class="link">
        <svg viewBox="0 0 460 18"><path d="M8 9H452M452 9l-14-8M452 9l-14 8" stroke="rgba(52,211,153,0.65)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
        <span>callback</span></div>
    </div>
    <div class="tiles">${tileHtml}</div>
  </div>
  <div class="caption">${caption}</div>
</div></body></html>`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('No Chrome or Edge found. Set CHROME to the browser binary.');
  return found;
}

const chrome = findChrome();
const work = join(tmpdir(), `rendobar-heroes-${process.pid}`);
mkdirSync(work, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const hero of HEROES) {
  const html = join(work, hero.file.replace('.png', '.html'));
  writeFileSync(html, page(hero));
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=2400,900',
    // Long enough for the font and the mark to arrive before the capture.
    '--virtual-time-budget=6000',
    `--user-data-dir=${join(work, 'profile')}`,
    `--screenshot=${join(OUT, hero.file)}`,
    pathToFileURL(html).href,
  ]);
  console.log(`images/automation/${hero.file}`);
}

rmSync(work, { recursive: true, force: true });
