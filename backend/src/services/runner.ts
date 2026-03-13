import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { exec, ChildProcess } from 'child_process';
import db, { SCREENSHOTS_DIR } from '../db';
import { StepAction } from '../types';

const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function substituteEnvVars(value: string, envVars: Record<string, string>): string {
  if (!value || typeof value !== 'string') return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => envVars[key] !== undefined ? envVars[key] : `{{${key}}}`);
}

async function callWebhook(url: string, payload: object): Promise<void> {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {}
}

// Track active runs so they can be cancelled
const activeRuns = new Map<number, { cancel: () => void }>();

// Track per-project sequential queues
const projectQueues = new Map<number, { cancelled: boolean }>();

export function cancelProjectQueue(projectId: number): void {
  const q = projectQueues.get(projectId);
  if (q) q.cancelled = true;
}

export async function runFlowsSequential(projectId: number, pairs: { flowId: number; runId: number }[]): Promise<void> {
  const state = { cancelled: false };
  projectQueues.set(projectId, state);
  try {
    for (const { flowId, runId } of pairs) {
      if (state.cancelled) {
        db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Stopped by user.', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`).run(runId);
        continue;
      }
      await runFlow(flowId, runId);
    }
  } finally {
    projectQueues.delete(projectId);
  }
}

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
    case 'upload_file':    return `Step ${index + 1}/${total}: Upload file to ${step.selector}`;
    case 'extract':        return `Step ${index + 1}/${total}: Extract "${step.selector}" → {{${step.varName}}}`;
    case 'wait_for_url':   return `Step ${index + 1}/${total}: Wait for URL to contain "${step.contains}" (up to ${Math.round((step.timeout || 120000) / 1000)}s)`;
    default:               return `Step ${index + 1}/${total}`;
  }
}

async function executeStep(page: Page, step: StepAction, runId: number, stepIndex: number, baseUrl?: string, envVars: Record<string, string> = {}): Promise<void> {
  switch (step.action) {
    case 'navigate': {
      let url: string = substituteEnvVars(step.url, envVars);
      if (baseUrl && (url.startsWith('/') || !url.startsWith('http'))) {
        url = baseUrl.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url);
      }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      break;
    }
    case 'click':
      await page.waitForSelector(step.selector, { timeout: 10000 });
      await page.click(step.selector);
      // Wait for any navigation triggered by the click to settle
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      break;
    case 'fill':
      await page.waitForSelector(step.selector, { timeout: 10000 });
      await page.fill(step.selector, substituteEnvVars(step.value, envVars));
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
    case 'wait_for_url': {
      const timeout = step.timeout || 120000;
      const interval = 1000;
      const start = Date.now();
      let found = false;
      while (Date.now() - start < timeout) {
        if (page.url().includes(step.contains)) {
          found = true;
          break;
        }
        await new Promise(r => setTimeout(r, interval));
      }
      if (!found) {
        throw new Error(`wait_for_url timed out after ${timeout}ms. Expected URL to contain "${step.contains}", got "${page.url()}"`);
      }
      break;
    }
    case 'assert_element': {
      try {
        await page.waitForSelector(step.selector, { timeout: 10000 });
      } catch {
        throw new Error(`Element assertion failed. Selector "${step.selector}" not found.`);
      }
      break;
    }
    case 'assert_text': {
      const text = await page.textContent(step.selector, { timeout: 8000 });
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
    case 'upload_file': {
      const fileUrl = substituteEnvVars(step.url, envVars);
      const safeName = (step.filename || `upload_${runId}_${stepIndex}`).replace(/[^a-zA-Z0-9_.\-]/g, '_');
      const tempPath = path.join(TEMP_DIR, safeName);
      const resp = await fetch(fileUrl);
      if (!resp.ok) throw new Error(`upload_file: failed to fetch "${fileUrl}" (${resp.status})`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(tempPath, buffer);
      await page.waitForSelector(step.selector, { state: 'attached', timeout: 10000 });
      await page.setInputFiles(step.selector, tempPath);
      break;
    }
    case 'extract': {
      let value = '';
      if (step.attribute) {
        value = await page.$eval(step.selector, (el: any, attr: string) => el.getAttribute(attr) || '', step.attribute).catch(() => '');
      } else {
        value = (await page.textContent(step.selector, { timeout: 8000 }).catch(() => '')) || '';
      }
      envVars[step.varName] = value.trim();
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

  const proj = db.prepare('SELECT headless, timeout_ms, webhook_url FROM projects WHERE id = ?').get(flow.project_id) as any;
  const recHeadless = !!proj?.headless;
  const recTimeout = proj?.timeout_ms || 60000;
  const recWebhookUrl: string | null = proj?.webhook_url || null;

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
  const browser = await chromium.launch({ headless: ${recHeadless}, slowMo: ${recHeadless ? 0 : 600} });
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
    timeout: recTimeout + 5000,
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
    if (recWebhookUrl) {
      callWebhook(recWebhookUrl, { run_id: runId, flow_id: flow.id, status: 'failed', error: errorMsg, timestamp: new Date().toISOString() });
    }

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
  const project = db.prepare('SELECT base_url, headless, timeout_ms, webhook_url, env_vars FROM projects WHERE id = ?').get(flow.project_id) as any;
  const baseUrl: string = project?.base_url || '';
  const isHeadless: boolean = !!project?.headless;
  const timeoutMs: number = project?.timeout_ms || 60000;
  const webhookUrl: string | null = project?.webhook_url || null;
  const envVars: Record<string, string> = (() => { try { return JSON.parse(project?.env_vars || '{}'); } catch { return {}; } })();
  db.prepare(`UPDATE runs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?`).run(runId);

  const startTime = Date.now();
  let browser: Browser | null = null;
  let cancelled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  activeRuns.set(runId, {
    cancel: () => {
      cancelled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (browser) browser.close().catch(() => {});
      const dur = Date.now() - startTime;
      db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Cancelled by user.', duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(dur, runId);
    },
  });

  try {
    browser = await chromium.launch({ headless: isHeadless, slowMo: isHeadless ? 0 : 600 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('pageerror', () => {});

    // Auto-timeout
    timeoutHandle = setTimeout(() => {
      if (browser) browser.close().catch(() => {});
    }, timeoutMs);

    const liveFile = `live_${runId}.png`;
    const livePath = path.join(SCREENSHOTS_DIR, liveFile);

    for (let i = 0; i < steps.length; i++) {
      if (cancelled) return;
      const stepDesc = describeStep(steps[i], i, steps.length);
      db.prepare(`UPDATE runs SET current_step = ? WHERE id = ?`).run(stepDesc, runId);
      await executeStep(page, steps[i], runId, i, baseUrl, envVars);

      // Auto-screenshot after every step (skip wait — page doesn't change)
      // Saves individually labelled screenshot per step so run detail shows full step trace
      const skipScreenshot = steps[i].action === 'wait';
      if (!skipScreenshot) {
        try {
          const stepFile = `run_${runId}_step_${String(i + 1).padStart(2, '0')}.png`;
          const stepPath = path.join(SCREENSHOTS_DIR, stepFile);
          await page.screenshot({ path: stepPath, fullPage: false });
          db.prepare(`INSERT INTO screenshots (run_id, filename, label) VALUES (?, ?, ?)`).run(runId, stepFile, stepDesc);
          // Copy to live view so dashboard shows current state
          fs.copyFileSync(stepPath, livePath);
          db.prepare(`UPDATE runs SET live_screenshot = ? WHERE id = ?`).run(liveFile, runId);
        } catch {}
      }

      // Pause between steps — long enough to observe live view and let page settle
      try { await page.waitForTimeout(1000); } catch {}
    }

    if (cancelled) return;

    clearTimeout(timeoutHandle);
    db.prepare(`UPDATE runs SET current_step = 'Finishing...' WHERE id = ?`).run(runId);
    const filename = `run_${runId}_final_pass.png`;
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: false });
    db.prepare(`INSERT INTO screenshots (run_id, filename, label) VALUES (?, ?, ?)`).run(runId, filename, 'final-pass');
    db.prepare(`UPDATE runs SET status = 'passed', duration_ms = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(Date.now() - startTime, runId);

  } catch (err: any) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
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
    if (webhookUrl) {
      callWebhook(webhookUrl, { run_id: runId, flow_id: flowId, status: 'failed', error: err.message, timestamp: new Date().toISOString() });
    }
    if (flow.retry_on_failure && !isRetry) {
      console.log(`[runner] Flow ${flowId} failed — retrying once`);
      const retryResult = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flowId);
      runFlow(flowId, Number(retryResult.lastInsertRowid), true).catch(console.error);
    }
  } finally {
    activeRuns.delete(runId);
    if (browser) await browser.close().catch(() => {});
    // Safety net — if run is still 'running' after all paths, force-fail it
    const stuck = db.prepare(`SELECT status FROM runs WHERE id = ?`).get(runId) as any;
    if (stuck?.status === 'running') {
      db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Run ended unexpectedly.', finished_at = CURRENT_TIMESTAMP WHERE id = ?`).run(runId);
    }
  }
}
