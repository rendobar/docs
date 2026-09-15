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
const WIDTH = 2400;
const HEIGHT = 900;

const logo = (name) => readFileSync(join(ROOT, 'images', 'logos', `${name}.svg`), 'utf8');

// Make's purple sits too close to the dark tile to read, so its mark is drawn
// in the tile's light ink and the brand colour carries the glow instead.
const TILES = {
  n8n: { svg: logo('n8n'), glow: '234, 75, 113' },
  activepieces: { svg: logo('activepieces'), glow: '129, 66, 227' },
  make: { svg: logo('make').replace('fill="#6D00CC"', 'fill="#F2F5F3"'), glow: '109, 0, 204' },
  zapier: { svg: logo('zapier'), glow: '255, 79, 0' },
};

// Captions describe what the page is about, never which platforms are live, so
// shipping a new integration does not date the image.
const HEROES = [
  {
    file: 'hero-overview.png',
    tiles: ['n8n', 'activepieces', 'make', 'zapier'],
    caption: 'Video and image jobs inside your workflows',
  },
  { file: 'hero-n8n.png', tiles: ['n8n'], caption: 'A verified node for n8n Cloud and self-hosted n8n' },
  {
    file: 'hero-activepieces.png',
    tiles: ['activepieces'],
    caption: 'Flows pause on a waitpoint until the job finishes',
  },
];

// Tile and logo sizes. With several platforms Rendobar is the larger hub they
// connect to. One to one, both sides are the same size.
const TILE = { size: 210, radius: 48, logo: 104 };
const HUB = { size: 300, radius: 68, logo: 162 };

// Where the Rendobar tile and the platform tiles sit. One platform sits to the
// right of Rendobar. Four split two on each side.
function layout(count) {
  const cy = 400;
  if (count === 1) {
    return { hub: { x: 930, y: cy, ...TILE }, tiles: [{ x: 1470, y: cy, side: 1 }] };
  }
  const rows = [cy - 150, cy + 150];
  const left = rows.map((y) => ({ x: 540, y, side: -1 }));
  const right = rows.map((y) => ({ x: WIDTH - 540, y, side: 1 }));
  return { hub: { x: WIDTH / 2, y: cy, ...HUB }, tiles: [...left, ...right].slice(0, count) };
}

// A horizontal S-curve from the Rendobar tile's edge to the platform tile's edge,
// with a dot at its midpoint.
function connector(hub, tile) {
  const start = { x: hub.x + tile.side * (hub.size / 2), y: hub.y };
  const end = { x: tile.x - tile.side * (TILE.size / 2), y: tile.y };
  const midX = (start.x + end.x) / 2;
  const c1 = { x: midX, y: start.y };
  const c2 = { x: midX, y: end.y };
  // The midpoint of a cubic Bezier is (P0 + 3*C1 + 3*C2 + P3) / 8.
  const dot = {
    x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
    y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
  };
  return { d: `M${start.x} ${start.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`, start, end, dot };
}

function page({ tiles, caption }) {
  const { hub, tiles: spots } = layout(tiles.length);
  const defs = [];
  const lines = [];
  const tileHtml = [];

  tiles.forEach((name, i) => {
    const t = TILES[name];
    const spot = spots[i];
    const c = connector(hub, spot);
    defs.push(
      `<linearGradient id="g${i}" gradientUnits="userSpaceOnUse" x1="${c.start.x}" y1="${c.start.y}" x2="${c.end.x}" y2="${c.end.y}">` +
        '<stop offset="0" stop-color="rgb(52,211,153)" stop-opacity="0.75"/>' +
        `<stop offset="1" stop-color="rgb(${t.glow})" stop-opacity="0.75"/></linearGradient>`,
    );
    lines.push(
      `<path d="${c.d}" stroke="url(#g${i})" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<circle cx="${c.dot.x}" cy="${c.dot.y}" r="11" fill="rgb(52,211,153)" opacity="0.35" filter="url(#blur)"/>` +
        `<circle cx="${c.dot.x}" cy="${c.dot.y}" r="5" fill="#d1fae5"/>`,
    );
    tileHtml.push(
      `<div class="tile" style="--glow:${t.glow};left:${spot.x - TILE.size / 2}px;top:${spot.y - TILE.size / 2}px">${t.svg}</div>`,
    );
  });

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&display=block">
<style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    position: relative;
    background:
      radial-gradient(1000px 560px at 50% 44%, rgba(16, 185, 129, 0.10), transparent 70%),
      #0a0b0b;
    font-family: Geist, system-ui, sans-serif;
  }
  body::before {
    content: ""; position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(1150px 640px at 50% 45%, #000 30%, transparent 80%);
  }
  svg.links { position: absolute; inset: 0; }
  .hub, .tile { position: absolute; display: grid; place-items: center; }
  .hub {
    width: ${hub.size}px; height: ${hub.size}px; border-radius: ${hub.radius}px;
    left: ${hub.x - hub.size / 2}px; top: ${hub.y - hub.size / 2}px;
    background: linear-gradient(160deg, #191c1b, #0f1110);
    border: 1px solid rgba(52, 211, 153, 0.22);
    box-shadow: 0 0 110px rgba(16, 185, 129, 0.20), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .hub img { width: ${hub.logo}px; height: ${hub.logo}px; }
  .tile {
    width: ${TILE.size}px; height: ${TILE.size}px; border-radius: ${TILE.radius}px;
    background: linear-gradient(160deg, #191c1b, #0f1110);
    border: 1px solid rgba(var(--glow), 0.30);
    box-shadow: 0 0 70px rgba(var(--glow), 0.20), inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .tile svg { width: ${TILE.logo}px; height: ${TILE.logo}px; }
  .caption {
    position: absolute; left: 0; right: 0; top: 740px; text-align: center;
    color: #b9c0bd; font-size: 46px; letter-spacing: -0.01em;
  }
</style></head><body>
<svg class="links" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs><filter id="blur" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="6"/></filter>${defs.join('')}</defs>
  ${lines.join('\n  ')}
</svg>
<div class="hub"><img src="https://cdn.rendobar.com/assets/brand/logo-mark.svg" alt=""></div>
${tileHtml.join('\n')}
<div class="caption">${caption}</div>
</body></html>`;
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
    `--window-size=${WIDTH},${HEIGHT}`,
    // Long enough for the font and the mark to arrive before the capture.
    '--virtual-time-budget=6000',
    `--user-data-dir=${join(work, 'profile')}`,
    `--screenshot=${join(OUT, hero.file)}`,
    pathToFileURL(html).href,
  ]);
  console.log(`images/automation/${hero.file}`);
}

rmSync(work, { recursive: true, force: true });
