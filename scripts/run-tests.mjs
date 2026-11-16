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
    b.onResolve({ filter: /^\.\/privacy$/ }, (args) => {
      if (args.resolveDir === join(root, 'src/background')) return { path: join(root, 'tests/stubs/privacy.ts') };
    });
    b.onResolve({ filter: /^(firebase\/|\.\/lib\/|\.\.\/vendor\/seeker\/firebaseInit)/ }, (args) => {
      if (['src/shared/submitToDrafted.ts', 'src/shared/workflowAccess.ts', 'src/shared/privacyPolicyAccess.ts', 'src/vendor/seeker/submitTaskCore.js'].some((file) => args.importer === join(root, file))) {
        return { path: join(root, 'tests/stubs/backend.ts') };
      }
    });
    b.onResolve({ filter: /^\.\/(auth|submitToDrafted)$/ }, (args) => {
      if (!['src/shared/submitManager.ts', 'src/shared/syncQueue.ts', 'src/shared/workflowAccess.ts'].some((file) => args.importer === join(root, file))) return null;
      return { path: join(root, 'tests/stubs/submission.ts') };
    });
    b.onResolve({ filter: /^\.\/sync$/ }, (args) => {
      if (args.importer === join(root, 'src/offscreen/index.ts')) return { path: join(root, 'tests/stubs/offscreenSync.ts') };
    });
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
