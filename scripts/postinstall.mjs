// Downloads Playwright's Chromium for local use. Skipped on Vercel, which uses @sparticuz/chromium instead.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

if (process.env.VERCEL || process.env.SKIP_BROWSER_DOWNLOAD) {
  console.log('Skipping Chromium download (serverless build).');
} else {
  const pkg = createRequire(import.meta.url).resolve('playwright-core/package.json');
  const cli = path.join(path.dirname(pkg), 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
}
