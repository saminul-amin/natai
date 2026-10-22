// Publishes the production build to the gh-pages branch, which GitHub Pages serves. Run with
// `npm run deploy` after `npm run build`; it needs no CI. The branch holds only the built site, as one
// commit per deploy, made in a temporary folder so the working tree is never touched.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIST = path.resolve('dist');
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('deploy: no dist/index.html; run `npm run build` first');
  process.exit(1);
}

const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const remote = git(['remote', 'get-url', 'origin']);
const source = git(['rev-parse', '--short', 'HEAD']);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natai-pages-'));
try {
  fs.cpSync(DIST, dir, { recursive: true });
  // Without this Pages runs Jekyll, which skips files and folders that start with an underscore.
  fs.writeFileSync(path.join(dir, '.nojekyll'), '');
  git(['init', '-q', '-b', 'gh-pages'], dir);
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', `Deploy ${source}`], dir);
  git(['push', '-q', '--force', remote, 'gh-pages'], dir);
  console.info(`deploy: pushed the build of ${source} to gh-pages`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
