/**
 * Generates one OG card PNG per page into ./public/og/.
 * Run via `npm run build:og` (defined in package.json scripts).
 *
 * Uses static TTF fonts from public/fonts/raw/ (pre-extracted from the
 * variable woff2 builds). Satori's bundled opentype.js cannot parse
 * variable fonts (fvar axis name lookup fails), so we ship static Bold/Medium
 * cuts as raw TTF files, which satori handles without decompression.
 *
 * static TTF source: Adobe Source Serif 4 and Source Sans 3 GitHub releases.
 *
 * @resvg/resvg-js converts the SVG that Satori produces into PNG.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ogTemplate } from '../src/og-template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Static TTF cuts — variable woff2 fonts fail satori's opentype parser
const serifFont = readFileSync(join(rootDir, 'public/fonts/raw/source-serif-4-bold.ttf'));
const sansFont = readFileSync(join(rootDir, 'public/fonts/raw/source-sans-3-medium.ttf'));

const pages = [
  { slug: 'index', title: 'Pull up a seat. Any AI.' },
  { slug: 'install', title: 'Install ChangeDown for Word' },
  { slug: 'security', title: 'Security and privacy at the wire' },
  { slug: 'privacy', title: 'Privacy policy' },
  { slug: 'terms', title: 'Terms of service' },
  { slug: 'faq', title: 'Frequently asked questions' },
];

const outDir = join(rootDir, 'public/og');
mkdirSync(outDir, { recursive: true });

const fonts = [
  { name: 'Source Serif 4', data: serifFont, weight: 700 as const, style: 'normal' as const },
  { name: 'Source Sans 3', data: sansFont, weight: 500 as const, style: 'normal' as const },
];

await Promise.all(
  pages.map(async (page) => {
    const svg = await satori(ogTemplate(page.title) as Parameters<typeof satori>[0], {
      width: 1200,
      height: 630,
      fonts,
    });
    const png = new Resvg(svg).render().asPng();
    writeFileSync(join(outDir, `${page.slug}.png`), png);
    console.log(`✓ public/og/${page.slug}.png`);
  })
);
