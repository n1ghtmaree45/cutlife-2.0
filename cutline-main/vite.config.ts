import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
/** Stamps the service worker with a per-build version so every deploy gets a fresh cache and the update toast fires. */
const swVersion = () => {
  const stamp = `${pkg.version}-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`;
  return { name: 'cutline-sw-version', apply: 'build' as const, closeBundle() {
    const f = new URL('./dist/sw.js', import.meta.url);
    try { writeFileSync(f, readFileSync(f, 'utf8').replace('__SW_VERSION__', stamp)); } catch { /* dist/sw.js missing in tests */ }
  } };
};
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [preact(), swVersion()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
