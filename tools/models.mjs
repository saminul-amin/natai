// The model pipeline (DESIGN.md 8.3): every source glTF in assets/source/ goes through glTF-Transform
// (quantize, meshopt compression, textures resized to the prop's budget and converted to WebP) into
// assets/models/. Run with `npm run models`; never process a model by hand.
//
//   assets/source/<name>.glb            the CC0 original, as downloaded (not committed)
//   assets/source/<name>.budget         optional: maximum texture size in pixels (default 512)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('assets/source');
const OUT = path.resolve('assets/models');
const CLI = path.resolve('node_modules/.bin/gltf-transform');

if (!fs.existsSync(SRC)) {
  console.info('models: no assets/source/ folder; nothing to process');
  process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });
const sources = fs.readdirSync(SRC).filter((f) => /\.(glb|gltf)$/i.test(f));
if (sources.length === 0) console.info('models: assets/source/ holds no glTF files');

for (const file of sources) {
  const name = file.replace(/\.(glb|gltf)$/i, '');
  const budgetFile = path.join(SRC, `${name}.budget`);
  const budget = fs.existsSync(budgetFile) ? Number(fs.readFileSync(budgetFile, 'utf8').trim()) || 512 : 512;
  const input = path.join(SRC, file);
  const output = path.join(OUT, `${name}.glb`);
  const run = (args) =>
    execFileSync(process.platform === 'win32' ? `${CLI}.cmd` : CLI, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  run(['optimize', input, output, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(budget)]);
  console.info(`models: ${file} → assets/models/${name}.glb (textures ≤ ${budget}px)`);
}
