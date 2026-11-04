// Bundles tests/*.test.ts with esbuild (already installed via vite), swaps the
// IndexedDB and screenshot modules for in-memory stubs, and runs the result
// with Node's built-in test runner. No extra dependencies.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules', '.cache', 'tests');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const stubs = {
  'storage/db': join(root, 'tests/stubs/db.ts'),
  'utils/captureQueue': join(root, 'tests/stubs/captureQueue.ts'),
};
const swapStubs = {
  name: 'swap-stubs',
  setup(b) {
    b.onResolve({ filter: /(storage\/db|utils\/captureQueue)$/ }, (args) => {
      if (args.importer.includes(`${join('tests', 'stubs')}`)) return null;
      const key = Object.keys(stubs).find((k) => args.path.endsWith(k));
      return key ? { path: stubs[key] } : null;
    });
  },
};

const entries = readdirSync(join(root, 'tests'))
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => join(root, 'tests', f));

await build({
  entryPoints: entries,
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  plugins: [swapStubs],
  logLevel: 'warning',
});

const files = readdirSync(out).filter((f) => f.endsWith('.mjs')).map((f) => join(out, f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
