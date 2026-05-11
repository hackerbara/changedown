import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import solidJs from '@astrojs/solid-js';

export default defineConfig({
  site: 'https://changedown.com',
  output: 'static',
  trailingSlash: 'never',
  build: { inlineStylesheets: 'auto', assets: '_assets' },
  integrations: [
    solidJs({ include: ['**/sandbox/**'] }),
    mdx(),
    sitemap({ filter: (page) => !page.includes('/word/') && !page.includes('/dev/') }),
  ],
  prefetch: { prefetchAll: false, defaultStrategy: 'viewport' },
  vite: {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: { cssMinify: 'lightningcss', target: 'es2022' },
  },
});
