// Bundle server/ + shared/ into plain ESM JS (dist/server) so the published package runs without tsx.
// npm packages stay external (resolved from node_modules at runtime); heavy ones like
// @huggingface/transformers are only loaded through dynamic import() when first used.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'dist', 'server');
fs.rmSync(outdir, { recursive: true, force: true });
await build({
  absWorkingDir: root,
  entryPoints: { index: 'server/index.ts', doctor: 'server/doctor-cli.ts' },
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  packages: 'external',
  chunkNames: 'chunks/[name]-[hash]',
  legalComments: 'none',
  logLevel: 'info',
});
