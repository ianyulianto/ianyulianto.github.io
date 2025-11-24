// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  outDir: '../docs',
  build: {
    assetsPrefix: './'
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
