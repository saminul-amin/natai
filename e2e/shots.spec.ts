import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import type { NataiHandle } from './handle';

// Milestone screenshots (DESIGN.md 8.5): the same four views every time, one fixed seed, four game
// times, one camera pose, high tier, on the WebGPU path. Run on a machine with a GPU:
//   npm run build && SHOTS=m5 npm run shots
// Frames are read back from the GPU through the game's own capture, so they match what renders.
const VIEWS = [
  { name: 'afternoon', t: '15:10' },
  { name: 'golden', t: '17:00' },
  { name: 'dusk', t: '17:50' },
  { name: 'night', t: '18:50' },
];
const CAMERA = '4,22,58';

for (const view of VIEWS) {
  test(`shot: ${view.name}`, async ({ page }) => {
    const dir = path.resolve('docs/shots', process.env.SHOTS ?? 'latest');
    fs.mkdirSync(dir, { recursive: true });
    await page.goto(`/?seed=1&tier=high&mode=freesky&hud=0&t=${view.t}&cam=${CAMERA}`);
    await page.waitForFunction(() => window.__natai?.ready === true, undefined, { timeout: 150_000 });
    const data = await page.evaluate(async () => {
      const n = window.__natai as NataiHandle;
      // Let the history-based passes settle, yielding so pipelines finish compiling.
      for (let i = 0; i < 40; i++) {
        n.advance(1);
        await new Promise((r) => setTimeout(r, 16));
      }
      const blob = await n.capture();
      if (!blob) return '';
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    fs.writeFileSync(path.join(dir, `${view.name}.png`), Buffer.from(data, 'base64'));
  });
}
