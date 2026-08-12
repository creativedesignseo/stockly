// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Static output on purpose: this site ships 0 KB of JavaScript.
// Every interaction on the page (FAQ accordion, mobile nav) is native HTML.
export default defineConfig({
  site: 'https://stocklygo.site',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // One stylesheet, inlined when small enough — mirrors the critical-CSS
    // strategy Shopify uses on its own marketing pages.
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
});
