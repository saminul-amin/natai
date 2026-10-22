// Refuses a build when any file under assets/ is missing from assets/CREDITS.md (DESIGN.md 8.3).
// First-party voice recordings under assets/audio/voices/ are exempt, as are licence texts.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('assets');
const CREDITS = path.join(ROOT, 'CREDITS.md');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const credits = fs.readFileSync(CREDITS, 'utf8');
const missing = walk(ROOT)
  .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
  .filter((f) => f !== 'CREDITS.md')
  .filter((f) => !f.startsWith('audio/voices/'))
  .filter((f) => !/^fonts\/OFL-.*\.txt$/.test(f))
  .filter((f) => !f.endsWith('.gitkeep'))
  .filter((f) => !credits.includes(f));

if (missing.length > 0) {
  console.error(`assets/CREDITS.md does not list ${missing.length} file(s):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.info('credits: every asset is listed');
