import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

/**
 * Resolve the Chromium binary to drive.
 *
 * `playwright-core` knows the build its version expects, but the browser may
 * already be installed at a different revision (the project pins one in dev and
 * CI installs whatever the lockfile resolves). Order:
 *
 *   1. `CHROME_PATH`, for a deliberate override;
 *   2. the path `playwright-core` expects, when it exists;
 *   3. any `chromium-*` build in the Playwright cache, newest first.
 */
export function chromiumPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const expected = chromium.executablePath();
  if (fs.existsSync(expected)) return expected;

  const cache = path.join(process.env.HOME ?? '', '.cache/ms-playwright');
  if (fs.existsSync(cache)) {
    const builds = fs
      .readdirSync(cache)
      .filter((entry) => entry.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const build of builds) {
      for (const layout of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const candidate = path.join(cache, build, layout);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return expected;
}
