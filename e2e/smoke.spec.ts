import { expect, test } from '@playwright/test';
import type { NataiHandle } from './handle';

// The smoke test (DESIGN.md 8.5): the production build boots, the menu appears, a game starts in each
// mode, the simulation advances, and nothing logs an error. It runs on the WebGL 2 path so that it can
// run on CI machines without a GPU.
test('boots, shows the menu and plays every mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?backend=webgl&tier=balanced&seed=3');
  await page.waitForFunction(() => window.__natai?.ready === true, undefined, { timeout: 150_000 });
  await expect(page.locator('.menu .start')).toBeVisible();
  await expect(page.locator('.title .bn').first()).toHaveText('নাটাই');

  for (const mode of ['shakrain', 'pench', 'freesky'] as const) {
    await page.goto(`/?backend=webgl&tier=balanced&seed=3&mode=${mode}`);
    await page.waitForFunction(() => window.__natai?.ready === true, undefined, { timeout: 150_000 });
    const tick = await page.evaluate(() => {
      const n = window.__natai as NataiHandle;
      n.simulate(20);
      n.advance(3);
      return { tick: n.game.world.tick, mode: n.game.world.mode, state: n.game.world.player.state };
    });
    expect(tick.mode).toBe(mode);
    expect(tick.tick).toBeGreaterThan(2000);
    expect(tick.state).toBe('flying');
    await expect(page.locator('.hud')).not.toHaveClass(/hidden/);
  }

  expect(errors.filter((e) => !/powerPreference|GPUAdapter|WebGPU/.test(e))).toEqual([]);
});
