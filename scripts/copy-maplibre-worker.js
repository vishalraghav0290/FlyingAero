// MapLibre 6 starts its Web Worker from a URL next to its own module file. Once Next.js
// bundles MapLibre that relative URL no longer exists, so the worker files are copied to
// /public and the app points MapLibre at them with setWorkerUrl().
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const src = path.join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist');
const dest = path.join(process.cwd(), 'public', 'vendor', 'maplibre');

if (!existsSync(src)) {
  console.warn('maplibre-gl not installed yet, skipping worker copy');
} else {
  mkdirSync(dest, { recursive: true });
  for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
    copyFileSync(path.join(src, f), path.join(dest, f));
  }
  console.log('Copied MapLibre worker to public/vendor/maplibre');
}
