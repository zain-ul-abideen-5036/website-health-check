/**
 * One place that knows how to start Chrome.
 * - Locally: the Chromium that `npm install` downloads through Playwright.
 * - On Vercel (or AWS Lambda): @sparticuz/chromium, a Chromium build small enough for serverless functions.
 */
import { chromium } from 'playwright-core';

export const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

let serverlessChrome = null;
async function sparticuz() {
  if (!serverlessChrome) {
    const mod = (await import('@sparticuz/chromium')).default;
    mod.setGraphicsMode = false; // no GPU in serverless
    serverlessChrome = { path: await mod.executablePath(), args: mod.args };
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
    return { chromePath: c.path, chromeFlags: [...c.args.filter((a) => !a.startsWith('--headless')), '--headless=new'] };
  }
  return { chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] };
}
