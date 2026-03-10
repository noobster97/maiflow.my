import { Router } from 'express';
import db from '../db';
import { scheduleProject } from '../services/scheduler';

const router = Router();

// List all projects with health summary
router.get('/', (req, res) => {
  try {
    const projects = db.prepare(`
      WITH latest_runs AS (
        SELECT flow_id, status, created_at
        FROM runs
        WHERE id IN (SELECT MAX(id) FROM runs GROUP BY flow_id)
      )
      SELECT p.*,
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT CASE WHEN lr.status = 'passed' THEN f.id END) as passing_flows,
        COUNT(DISTINCT CASE WHEN lr.status = 'failed' THEN f.id END) as failing_flows,
        MAX(lr.created_at) as last_run_at
      FROM projects p
      LEFT JOIN flows f ON f.project_id = p.id
      LEFT JOIN latest_runs lr ON lr.flow_id = f.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project
router.get('/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create project
router.post('/', (req, res) => {
  try {
    const { name, base_url, description, schedule, headless, timeout_ms, webhook_url, env_vars } = req.body;
    if (!name || !base_url) return res.status(400).json({ error: 'name and base_url are required' });
    if (!base_url.startsWith('http://') && !base_url.startsWith('https://')) {
      return res.status(400).json({ error: 'base_url must start with http:// or https://' });
    }
    const result = db.prepare('INSERT INTO projects (name, base_url, description, schedule, headless, timeout_ms, webhook_url, env_vars) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(name, base_url, description || '', schedule || null, headless ? 1 : 0, timeout_ms || 60000, webhook_url || null, env_vars || '{}');
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    scheduleProject(project.id, project.schedule);
    res.status(201).json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update project
router.put('/:id', (req, res) => {
  try {
    const { name, base_url, description, schedule, headless, timeout_ms, webhook_url, env_vars } = req.body;
    if (base_url && !base_url.startsWith('http://') && !base_url.startsWith('https://')) {
      return res.status(400).json({ error: 'base_url must start with http:// or https://' });
    }
    db.prepare('UPDATE projects SET name = ?, base_url = ?, description = ?, schedule = ?, headless = ?, timeout_ms = ?, webhook_url = ?, env_vars = ? WHERE id = ?')
      .run(name, base_url, description, schedule || null, headless ? 1 : 0, timeout_ms || 60000, webhook_url || null, env_vars || '{}', req.params.id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
    scheduleProject(project.id, project.schedule);
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete project
router.delete('/:id', (req, res) => {
  try {
    scheduleProject(parseInt(req.params.id), null); // cancel any cron task
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all runs + screenshots for all flows in a project
router.delete('/:id/runs', (req, res) => {
  try {
    const projectId = req.params.id;
    // Get all flow IDs for this project
    const flows = db.prepare('SELECT id FROM flows WHERE project_id = ?').all(projectId) as { id: number }[];
    if (flows.length === 0) return res.json({ deleted_runs: 0, deleted_screenshots: 0 });

    const flowIds = flows.map(f => f.id);
    const placeholders = flowIds.map(() => '?').join(',');

    // Get all screenshot filenames to delete from disk
    const runRows = db.prepare(`SELECT id FROM runs WHERE flow_id IN (${placeholders})`).all(...flowIds) as { id: number }[];
    const runIds = runRows.map(r => r.id);
    let deletedScreenshots = 0;

    if (runIds.length > 0) {
      const runPlaceholders = runIds.map(() => '?').join(',');
      const screenshots = db.prepare(`SELECT filename FROM screenshots WHERE run_id IN (${runPlaceholders})`).all(...runIds) as { filename: string }[];
      // Delete screenshot files from disk
      const { SCREENSHOTS_DIR } = require('../db');
      const fs = require('fs');
      const path = require('path');
      for (const ss of screenshots) {
        try { fs.unlinkSync(path.join(SCREENSHOTS_DIR, ss.filename)); } catch {}
      }
      // Also delete live screenshot files for these runs
      for (const runId of runIds) {
        try { fs.unlinkSync(path.join(SCREENSHOTS_DIR, `live_${runId}.png`)); } catch {}
      }
      db.prepare(`DELETE FROM screenshots WHERE run_id IN (${runPlaceholders})`).run(...runIds);
      deletedScreenshots = screenshots.length;
    }

    // Delete all runs for these flows
    const deletedRuns = db.prepare(`DELETE FROM runs WHERE flow_id IN (${placeholders})`).run(...flowIds);

    // Reset auto-increment counters if tables are now globally empty
    const runsLeft = (db.prepare('SELECT COUNT(*) as c FROM runs').get() as any).c;
    const ssLeft = (db.prepare('SELECT COUNT(*) as c FROM screenshots').get() as any).c;
    if (runsLeft === 0) db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'runs'`).run();
    if (ssLeft === 0) db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'screenshots'`).run();

    res.json({ deleted_runs: deletedRuns.changes, deleted_screenshots: deletedScreenshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all flows (definitions + runs + screenshots) for a project
router.delete('/:id/flows', (req, res) => {
  try {
    const projectId = req.params.id;
    const flows = db.prepare('SELECT id FROM flows WHERE project_id = ?').all(projectId) as { id: number }[];
    if (flows.length === 0) return res.json({ deleted_flows: 0, deleted_runs: 0, deleted_screenshots: 0 });

    const flowIds = flows.map(f => f.id);
    const placeholders = flowIds.map(() => '?').join(',');

    // Get all run IDs for these flows
    const runRows = db.prepare(`SELECT id FROM runs WHERE flow_id IN (${placeholders})`).all(...flowIds) as { id: number }[];
    const runIds = runRows.map(r => r.id);
    let deletedScreenshots = 0;

    if (runIds.length > 0) {
      const runPlaceholders = runIds.map(() => '?').join(',');
      const screenshots = db.prepare(`SELECT filename FROM screenshots WHERE run_id IN (${runPlaceholders})`).all(...runIds) as { filename: string }[];
      const { SCREENSHOTS_DIR } = require('../db');
      const fs = require('fs');
      const path = require('path');
      for (const ss of screenshots) {
        try { fs.unlinkSync(path.join(SCREENSHOTS_DIR, ss.filename)); } catch {}
      }
      for (const runId of runIds) {
        try { fs.unlinkSync(path.join(SCREENSHOTS_DIR, `live_${runId}.png`)); } catch {}
      }
      db.prepare(`DELETE FROM screenshots WHERE run_id IN (${runPlaceholders})`).run(...runIds);
      deletedScreenshots = screenshots.length;
    }

    const deletedRuns = runIds.length > 0
      ? db.prepare(`DELETE FROM runs WHERE flow_id IN (${placeholders})`).run(...flowIds).changes
      : 0;

    db.prepare(`DELETE FROM flows WHERE id IN (${placeholders})`).run(...flowIds);

    // Reset auto-increment counters if tables are now globally empty
    const runsLeft = (db.prepare('SELECT COUNT(*) as c FROM runs').get() as any).c;
    const ssLeft = (db.prepare('SELECT COUNT(*) as c FROM screenshots').get() as any).c;
    const flowsLeft = (db.prepare('SELECT COUNT(*) as c FROM flows').get() as any).c;
    if (runsLeft === 0) db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'runs'`).run();
    if (ssLeft === 0) db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'screenshots'`).run();
    if (flowsLeft === 0) db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'flows'`).run();

    res.json({ deleted_flows: flows.length, deleted_runs: deletedRuns, deleted_screenshots: deletedScreenshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
