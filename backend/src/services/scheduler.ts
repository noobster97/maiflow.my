import cron, { ScheduledTask } from 'node-cron';
import path from 'path';
import fs from 'fs';
import db, { SCREENSHOTS_DIR } from '../db';
import { runFlow } from './runner';

const tasks = new Map<number, ScheduledTask>();

const SCHEDULE_EXPRESSIONS: Record<string, string> = {
  every_30m: '*/30 * * * *',
  hourly:    '0 * * * *',
  every_6h:  '0 */6 * * *',
  daily:     '0 8 * * *',
};

export const SCHEDULE_OPTIONS = [
  { value: '',          label: 'No schedule' },
  { value: 'every_30m', label: 'Every 30 minutes' },
  { value: 'hourly',    label: 'Every hour' },
  { value: 'every_6h',  label: 'Every 6 hours' },
  { value: 'daily',     label: 'Daily at 8am' },
];

function triggerProject(projectId: number) {
  const flows = db.prepare('SELECT * FROM flows WHERE project_id = ?').all(projectId) as any[];
  for (const flow of flows) {
    const result = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flow.id);
    const runId = Number(result.lastInsertRowid);
    runFlow(flow.id, runId).catch(console.error);
  }
  console.log(`[scheduler] Project ${projectId}: triggered ${flows.length} flows`);
}

export function scheduleProject(projectId: number, schedule: string | null) {
  // Cancel existing task
  if (tasks.has(projectId)) {
    tasks.get(projectId)!.stop();
    tasks.delete(projectId);
  }
  if (!schedule || !SCHEDULE_EXPRESSIONS[schedule]) return;

  const task = cron.schedule(SCHEDULE_EXPRESSIONS[schedule], () => triggerProject(projectId));
  tasks.set(projectId, task);
  console.log(`[scheduler] Project ${projectId} scheduled: ${schedule}`);
}

function runScreenshotCleanup() {
  // Delete screenshots and run records older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oldScreenshots = db.prepare(`
    SELECT s.filename FROM screenshots s
    JOIN runs r ON s.run_id = r.id
    WHERE r.finished_at < ? AND r.finished_at IS NOT NULL
  `).all(cutoff) as { filename: string }[];

  for (const ss of oldScreenshots) {
    try { fs.unlinkSync(path.join(SCREENSHOTS_DIR, ss.filename)); } catch {}
  }

  // Also delete dangling live_* files (from cancelled/crashed runs)
  try {
    const files = fs.readdirSync(SCREENSHOTS_DIR);
    for (const f of files) {
      if (f.startsWith('live_')) {
        const mtime = fs.statSync(path.join(SCREENSHOTS_DIR, f)).mtimeMs;
        if (Date.now() - mtime > 60 * 60 * 1000) { // older than 1h
          try { fs.unlinkSync(path.join(SCREENSHOTS_DIR, f)); } catch {}
        }
      }
    }
  } catch {}

  const result = db.prepare(`DELETE FROM runs WHERE finished_at < ? AND finished_at IS NOT NULL`).run(cutoff);
  if (result.changes > 0 || oldScreenshots.length > 0)
    console.log(`[cleanup] Removed ${result.changes} old run(s) and ${oldScreenshots.length} screenshot(s)`);
}

export function initScheduler() {
  const projects = db.prepare(`SELECT * FROM projects WHERE schedule IS NOT NULL AND schedule != ''`).all() as any[];
  for (const p of projects) scheduleProject(p.id, p.schedule);
  console.log(`[scheduler] Initialized ${projects.length} scheduled project(s)`);

  // Run screenshot/run cleanup daily at 3am
  cron.schedule('0 3 * * *', runScreenshotCleanup);
}
