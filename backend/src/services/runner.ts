import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { exec, ChildProcess } from 'child_process';
import db, { SCREENSHOTS_DIR } from '../db';
import { StepAction } from '../types';

const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Track active runs so they can be cancelled
const activeRuns = new Map<number, { cancel: () => void }>();

export function cancelRun(runId: number): boolean {
  const entry = activeRuns.get(runId);
  if (!entry) return false;
  entry.cancel();
  activeRuns.delete(runId);
  return true;
}

export function isRunActive(runId: number): boolean {
  return activeRuns.has(runId);
}

function describeStep(step: StepAction, index: number, total: number): string {
  switch (step.action) {
    case 'navigate':       return `Step ${index + 1}/${total}: Navigate to ${step.url}`;
    case 'click':          return `Step ${index + 1}/${total}: Click ${step.selector}`;
    case 'fill':           return `Step ${index + 1}/${total}: Fill "${step.value}" into ${step.selector}`;
    case 'select':         return `Step ${index + 1}/${total}: Select "${step.value}" in ${step.selector}`;
    case 'wait':           return `Step ${index + 1}/${total}: Wait ${step.ms}ms`;
    case 'assert_url':     return `Step ${index + 1}/${total}: Assert URL contains "${step.contains}"`;
    case 'assert_element': return `Step ${index + 1}/${total}: Assert element exists ${step.selector}`;
    case 'assert_text':    return `Step ${index + 1}/${total}: Assert text "${step.contains}"`;
    case 'screenshot':     return `Step ${index + 1}/${total}: Screenshot "${step.name}"`;
    default:               return `Step ${index + 1}/${total}`;
  }
}

async function executeStep(page: Page, step: StepAction, runId: number, stepIndex: number): Promise<void> {
  switch (step.action) {
    case 'navigate':
      await page.goto(step.url, { waitUntil: 'networkidle' });
      break;
    case 'click':
      await page.waitForSelector(step.selector, { timeout: 10000 });
      await page.click(step.selector);
      // Wait for any navigation triggered by the click to settle
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      break;
    case 'fill':
      await page.waitForSelector(step.selector, { timeout: 10000 });
      await page.fill(step.selector, step.value);
      break;
    case 'select':
      await page.waitForSelector(step.selector, { timeout: 10000 });
      await page.selectOption(step.selector, step.value);
      break;
    case 'wait':
      await page.waitForTimeout(step.ms);
      break;
    case 'assert_url': {
      const url = page.url();
      if (!url.includes(step.contains))
        throw new Error(`URL assertion failed. Expected URL to contain "${step.contains}", got "${url}"`);
      break;
    }
    case 'assert_element': {
      const el = await page.$(step.selector);
      if (!el) throw new Error(`Element assertion failed. Selector "${step.selector}" not found.`);
      break;
    }
    case 'assert_text': {
      const text = await page.textContent(step.selector);
      if (!text || !text.includes(step.contains))
        throw new Error(`Text assertion failed. Expected "${step.contains}" in "${text}"`);
      break;
    }
    case 'screenshot': {
      const safeName = (step.name || 'screenshot').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `run_${runId}_step_${stepIndex}_${safeName}.png`;
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: false });
      db.prepare(`INSERT INTO screenshots (run_id, filename, label) VALUES (?, ?, ?)`).run(runId, filename, step.name);
      break;
    }
  }
}

// Wrap exec() in a Promise that exposes the child process for cancellation
function execWithHandle(command: string, options: { cwd: string; timeout: number }): { promise: Promise<{ stdout: string; stderr: string }>; child: ChildProcess } {
  let child!: ChildProcess;
  const promise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    child = exec(command, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
  return { promise, child };
}

function killProcess(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${child.pid} /f /t`, () => {});
    } else {
      child.kill('SIGKILL');
    }
  } catch {}
}

async function runRecordedFlow(flow: any, runId: number): Promise<void> {
  const startTime = Date.now();
  db.prepare(`UPDATE runs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?`).run(runId);

  const script: string = flow.script || '';
  if (!script.trim()) {
    db.prepare(`UPDATE runs SET status = 'failed', error_message = ?, duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run('No recorded script found.', 0, runId);
    return;
  }

  const bodyMatch = script.match(/async\s*\(\{\s*page\s*(?:,\s*\w+\s*)*\}\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/m);
  const body = bodyMatch ? bodyMatch[1] : '';

  if (!body.trim()) {
    db.prepare(`UPDATE runs SET status = 'failed', error_message = ?, duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run('Could not parse recorded script. Re-record the flow.', 0, runId);
    return;
  }

  const screenshotPass = path.join(SCREENSHOTS_DIR, `run_${runId}_final_pass.png`).replace(/\\/g, '/');
  const screenshotFail = path.join(SCREENSHOTS_DIR, `run_${runId}_failure.png`).replace(/\\/g, '/');

  const standalone = `
import { chromium } from 'playwright';
import { expect } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
${body}
    await page.screenshot({ path: '${screenshotPass}' });
    console.log('__PASSED__');
  } catch (err: any) {
    try { await page.screenshot({ path: '${screenshotFail}' }); } catch {}
    console.error('__ERROR__:' + err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
`.trim();

  const tempFile = path.join(TEMP_DIR, `run_${runId}.ts`);
  fs.writeFileSync(tempFile, standalone);

  let cancelled = false;
  const { promise, child } = execWithHandle(`npx tsx "${tempFile}"`, {
    cwd: path.join(__dirname, '..', '..'),
    timeout: 60000,
  });

  activeRuns.set(runId, {
    cancel: () => {
      cancelled = true;
      killProcess(child);
      const dur = Date.now() - startTime;
      db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Cancelled by user.', duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(dur, runId);
    },
  });

  try {
    await promise;

    if (cancelled) return;

    if (fs.existsSync(path.join(SCREENSHOTS_DIR, `run_${runId}_final_pass.png`))) {
      db.prepare(`INSERT INTO screenshots (run_id, filename, label) VALUES (?, ?, ?)`).run(runId, `run_${runId}_final_pass.png`, 'final-pass');
    }
    db.prepare(`UPDATE runs SET status = 'passed', duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(Date.now() - startTime, runId);

  } catch (err: any) {
    if (cancelled) return;

    const stderr: string = err.stderr || err.stdout || err.message || 'Unknown error';
    const errorMatch = stderr.match(/__ERROR__:([\s\S]+)/);
    const errorMsg = errorMatch ? errorMatch[1].trim() : stderr.substring(0, 1000);

    if (fs.existsSync(path.join(SCREENSHOTS_DIR, `run_${runId}_failure.png`))) {
      db.prepare(`INSERT INTO screenshots (run_id, filename, label) VALUES (?, ?, ?)`).run(runId, `run_${runId}_failure.png`, 'failure');
    }
    db.prepare(`UPDATE runs SET status = 'failed', error_message = ?, duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(errorMsg, Date.now() - startTime, runId);

  } finally {
    activeRuns.delete(runId);
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

export async function runFlow(flowId: number, runId: number, isRetry = false): Promise<void> {
  const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId) as any;
  if (!flow) throw new Error('Flow not found');

  if (flow.type === 'recorded') {
    await runRecordedFlow(flow, runId);
    const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as any;
    if (run?.status === 'failed' && flow.retry_on_failure && !isRetry) {
      console.log(`[runner] Flow ${flowId} failed — retrying once`);
      const retryResult = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flowId);
      await runFlow(flowId, Number(retryResult.lastInsertRowid), true);
    }
    return;
  }

  const steps: StepAction[] = JSON.parse(flow.steps);
  db.prepare(`UPDATE runs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?`).run(runId);

  const startTime = Date.now();
  let browser: Browser | null = null;
  let cancelled = false;

  activeRuns.set(runId, {
    cancel: () => {
      cancelled = true;
      if (browser) browser.close().catch(() => {});
      const dur = Date.now() - startTime;
      db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Cancelled by user.', duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(dur, runId);
    },
  });

  try {
    browser = await chromium.launch({ headless: false, slowMo: 600 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('pageerror', () => {});

    const liveFile = `live_${runId}.png`;
    const livePath = path.join(SCREENSHOTS_DIR, liveFile);

    for (let i = 0; i < steps.length; i++) {
      if (cancelled) return;
      const stepDesc = describeStep(steps[i], i, steps.length);
      db.prepare(`UPDATE runs SET current_step = ? WHERE id = ?`).run(stepDesc, runId);
      await executeStep(page, steps[i], runId, i);
      try {
        await page.screenshot({ path: livePath, fullPage: false });
        db.prepare(`UPDATE runs SET live_screenshot = ? WHERE id = ?`).run(liveFile, runId);
      } catch {}
      // Small pause so live view is visible between steps
      await page.waitForTimeout(400);
    }

    if (cancelled) return;

    db.prepare(`UPDATE runs SET current_step = 'Finishing...' WHERE id = ?`).run(runId);
    const filename = `run_${runId}_final_pass.png`;
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: false });
    db.prepare(`INSERT INTO screenshots (run_id, filename, label) VALUES (?, ?, ?)`).run(runId, filename, 'final-pass');
    db.prepare(`UPDATE runs SET status = 'passed', duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(Date.now() - startTime, runId);

  } catch (err: any) {
    if (cancelled) return;
    const duration = Date.now() - startTime;
    try {
      if (browser) {
        const pages = browser.contexts()[0]?.pages();
        if (pages?.length > 0) {
          const filename = `run_${runId}_failure.png`;
          await pages[0].screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: false });
          db.prepare(`INSERT INTO screenshots (run_id, filename, label) VALUES (?, ?, ?)`).run(runId, filename, 'failure');
        }
      }
    } catch {}
    db.prepare(`UPDATE runs SET status = 'failed', error_message = ?, duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(err.message || 'Unknown error', duration, runId);
    if (flow.retry_on_failure && !isRetry) {
      console.log(`[runner] Flow ${flowId} failed — retrying once`);
      const retryResult = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flowId);
      runFlow(flowId, Number(retryResult.lastInsertRowid), true).catch(console.error);
    }
  } finally {
    activeRuns.delete(runId);
    if (browser) await browser.close().catch(() => {});
  }
}
