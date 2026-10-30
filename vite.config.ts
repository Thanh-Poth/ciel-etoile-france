import { defineConfig, loadEnv, type Plugin } from 'vite';
import 'vitest/config';

/**
 * Politique de sécurité du contenu injectée au build : seul le serveur du fond de carte est autorisé
 * en plus du site lui-même (aucun autre tiers, aucun script en ligne, aucun eval).
 */
function csp(mapStyle: string | undefined, extra: string | undefined): Plugin {
  const origins = new Set(['https://tiles.openfreemap.org']);
  if (mapStyle) origins.add(new URL(mapStyle).origin);
  for (const o of (extra ?? '').split(/[\s,]+/).filter(Boolean)) origins.add(new URL(o).origin);
  const hosts = [...origins].join(' ');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${hosts}`,
    `connect-src 'self' ${hosts}`,
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Chemins relatifs : fonctionne sur GitHub Pages (sous-dossier) comme sur Cloudflare Pages.
    base: './',
    plugins: [csp(env.VITE_MAP_STYLE, env.VITE_EXTRA_ORIGINS)],
    build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
