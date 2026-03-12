import { Router } from 'express';
import db from '../db';
import { runFlow, cancelRun, runFlowsSequential, cancelProjectQueue } from '../services/runner';

const router = Router();

// Get latest runs across all flows — MUST be before /:id
router.get('/recent/:limit?', (req, res) => {
  try {
    const limit = parseInt(req.params.limit || '20');
    const runs = db.prepare(`
      SELECT r.*, f.name as flow_name, p.name as project_name
      FROM runs r
      JOIN flows f ON r.flow_id = f.id
      JOIN projects p ON f.project_id = p.id
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List runs for a flow
router.get('/flow/:flowId', (req, res) => {
  try {
    const runs = db.prepare('SELECT * FROM runs WHERE flow_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.flowId);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single run with screenshots
router.get('/:id', (req, res) => {
  try {
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const screenshots = db.prepare('SELECT * FROM screenshots WHERE run_id = ? ORDER BY id ASC').all(req.params.id);
    res.json({ ...run as object, screenshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a running/pending run
router.post('/:id/cancel', (req, res) => {
  try {
    const runId = parseInt(req.params.id);
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'running' && run.status !== 'pending') {
      return res.status(400).json({ error: 'Run is not active' });
    }

    const cancelled = cancelRun(runId);
    if (!cancelled) {
      // Process already gone — mark it directly
      db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Cancelled by user.', finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(runId);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger a run for a flow (with concurrent protection)
router.post('/flow/:flowId/run', async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    // Prevent duplicate concurrent runs
    const activeRun = db.prepare(`SELECT id FROM runs WHERE flow_id = ? AND status IN ('running', 'pending')`).get(flowId) as any;
    if (activeRun) return res.status(409).json({ error: 'This flow already has an active run.', run_id: activeRun.id });

    const result = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flowId);
    const runId = Number(result.lastInsertRowid);
    runFlow(flowId, runId).catch(console.error);
    res.status(202).json({ run_id: runId, message: 'Run started' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Run ALL flows for a project — sequentially, one by one
router.post('/project/:projectId/run-all', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const flows = db.prepare('SELECT * FROM flows WHERE project_id = ?').all(projectId) as any[];
    if (flows.length === 0) return res.status(400).json({ error: 'No flows in this project' });

    // Skip flows that already have an active run
    const pairs: { flowId: number; runId: number }[] = [];
    for (const flow of flows) {
      const activeRun = db.prepare(`SELECT id FROM runs WHERE flow_id = ? AND status IN ('running', 'pending')`).get(flow.id);
      if (activeRun) continue;
      const result = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flow.id);
      pairs.push({ flowId: flow.id, runId: Number(result.lastInsertRowid) });
    }

    if (pairs.length === 0) return res.status(409).json({ error: 'All flows already have active runs.' });

    // Run sequentially in background
    runFlowsSequential(projectId, pairs).catch(console.error);

    res.status(202).json({ message: `Queued ${pairs.length} flows (sequential)`, run_ids: pairs.map(p => p.runId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Run only FAILED flows for a project — sequentially
router.post('/project/:projectId/run-failed', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const failedFlows = db.prepare(`
      SELECT f.* FROM flows f
      JOIN runs r ON r.id = (SELECT MAX(id) FROM runs WHERE flow_id = f.id)
      WHERE f.project_id = ? AND r.status = 'failed'
    `).all(projectId) as any[];

    if (failedFlows.length === 0) return res.status(400).json({ error: 'No failed flows to re-run' });

    const pairs: { flowId: number; runId: number }[] = [];
    for (const flow of failedFlows) {
      const activeRun = db.prepare(`SELECT id FROM runs WHERE flow_id = ? AND status IN ('running', 'pending')`).get(flow.id);
      if (activeRun) continue;
      const result = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flow.id);
      pairs.push({ flowId: flow.id, runId: Number(result.lastInsertRowid) });
    }

    if (pairs.length === 0) return res.status(409).json({ error: 'All failed flows already have active runs.' });

    runFlowsSequential(projectId, pairs).catch(console.error);
    res.status(202).json({ message: `Queued ${pairs.length} failed flows (sequential)`, run_ids: pairs.map(p => p.runId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/project/:projectId/run-never-run', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const neverRunFlows = db.prepare(`
      SELECT f.* FROM flows f
      LEFT JOIN runs r ON r.flow_id = f.id
      WHERE f.project_id = ? AND r.id IS NULL
    `).all(projectId) as any[];

    if (neverRunFlows.length === 0) return res.status(400).json({ error: 'No unrun flows found' });

    const pairs: { flowId: number; runId: number }[] = [];
    for (const flow of neverRunFlows) {
      const activeRun = db.prepare(`SELECT id FROM runs WHERE flow_id = ? AND status IN ('running', 'pending')`).get(flow.id);
      if (activeRun) continue;
      const result = db.prepare('INSERT INTO runs (flow_id) VALUES (?)').run(flow.id);
      pairs.push({ flowId: flow.id, runId: Number(result.lastInsertRowid) });
    }

    if (pairs.length === 0) return res.status(409).json({ error: 'All unrun flows already have active runs.' });

    runFlowsSequential(projectId, pairs).catch(console.error);
    res.status(202).json({ message: `Queued ${pairs.length} never-run flows (sequential)`, run_ids: pairs.map(p => p.runId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stop all — cancel current run + immediately fail all pending runs
router.post('/project/:projectId/stop-all', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Stop the queue so no new runs start
    cancelProjectQueue(projectId);

    // Get ALL active runs (running + pending) for this project
    const allActive = db.prepare(`
      SELECT r.id, r.status FROM runs r
      JOIN flows f ON r.flow_id = f.id
      WHERE f.project_id = ? AND r.status IN ('running', 'pending')
    `).all(projectId) as any[];

    for (const run of allActive) {
      if (run.status === 'running') {
        // Try to kill the browser/process via the active runs map
        const killed = cancelRun(run.id);
        if (!killed) {
          // Not in map (edge case) — force fail via DB directly
          db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Stopped by user.', finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(run.id);
        }
      } else {
        // Pending — mark failed immediately, don't wait for queue loop
        db.prepare(`UPDATE runs SET status = 'failed', error_message = 'Stopped by user.', finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(run.id);
      }
    }

    res.json({ success: true, stopped: allActive.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
