import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Chemins relatifs : fonctionne sur GitHub Pages (sous-dossier) comme sur Cloudflare Pages.
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
