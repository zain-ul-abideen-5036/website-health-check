/**
 * One place that knows how to start Chrome.
 * - Locally: the Chromium that `npm install` downloads through Playwright.
 * - On Vercel (or AWS Lambda): @sparticuz/chromium, a Chromium build small enough for serverless functions.
 */
import { chromium } from 'playwright-core';

export const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Flags from @sparticuz/chromium that break or skew an audit:
// - --single-process: closing one page or context can take the whole browser down
//   ("Target page, context or browser has been closed"), and Lighthouse is unreliable with it.
// - --disable-web-security / --allow-running-insecure-content: would hide CORS and mixed-content problems.
// - --headless=...: Playwright and chrome-launcher set headless mode themselves.
const UNWANTED = [/^--single-process$/, /^--disable-web-security$/, /^--allow-running-insecure-content$/, /^--headless/];

// playwright-core is pinned to the release built for the same Chromium version as @sparticuz/chromium
// (playwright-core 1.63.0 = Chromium 153). Upgrade both together.
let serverlessChrome = null;
async function sparticuz() {
  if (!serverlessChrome) {
    const mod = (await import('@sparticuz/chromium')).default;
    mod.setGraphicsMode = false; // no GPU in serverless
    serverlessChrome = { path: await mod.executablePath(), args: mod.args.filter((a) => !UNWANTED.some((r) => r.test(a))) };
  }
  return serverlessChrome;
}

/** Launch a Playwright browser. */
export async function launchBrowser(extraArgs = []) {
  if (isServerless) {
    const c = await sparticuz();
    return chromium.launch({ executablePath: c.path, args: [...c.args, ...extraArgs], headless: true });
  }
  return chromium.launch({ args: extraArgs });
}

/** Chrome path and flags for Lighthouse, which launches Chrome itself through chrome-launcher. */
export async function chromeForLighthouse() {
  if (isServerless) {
    const c = await sparticuz();
    return { chromePath: c.path, chromeFlags: [...c.args, '--headless=new'] };
  }
  return { chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] };
}
