import { Router } from 'express';
import db from '../db';

const router = Router();

// Download template JSON — user gives this to Claude to fill in
router.get('/template', (req, res) => {
  const template = [
    {
      name: "Login - Success",
      steps: [
        { action: "navigate", url: "/login" },
        { action: "fill", selector: "#email", value: "test@example.com" },
        { action: "fill", selector: "#password", value: "password123" },
        { action: "click", selector: "[type='submit']" },
        { action: "screenshot", name: "after-submit" },
        { action: "assert_url", contains: "/dashboard" }
      ]
    },
    {
      name: "Login - Wrong Password",
      steps: [
        { action: "navigate", url: "/login" },
        { action: "fill", selector: "#email", value: "test@example.com" },
        { action: "fill", selector: "#password", value: "wrongpassword" },
        { action: "click", selector: "[type='submit']" },
        { action: "screenshot", name: "after-wrong-password" },
        { action: "assert_text", selector: "body", contains: "Invalid" }
      ]
    },
    {
      name: "Register - New User",
      steps: [
        { action: "navigate", url: "/register" },
        { action: "fill", selector: "#name", value: "Test User" },
        { action: "fill", selector: "#email", value: "newuser@example.com" },
        { action: "fill", selector: "#password", value: "password123" },
        { action: "click", selector: "[type='submit']" },
        { action: "screenshot", name: "after-register" },
        { action: "assert_url", contains: "/dashboard" }
      ]
    }
  ];
  res.setHeader('Content-Disposition', 'attachment; filename="flows-template.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(template);
});

// Import flows from JSON array — created by Claude
router.post('/import/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const flows = req.body;
    if (!Array.isArray(flows) || flows.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of flows' });
    }
    const created: number[] = [];
    for (const flow of flows) {
      if (!flow.name || !Array.isArray(flow.steps)) continue;
      const result = db.prepare(
        'INSERT INTO flows (project_id, name, steps, type, order_index) VALUES (?, ?, ?, ?, ?)'
      ).run(projectId, flow.name, JSON.stringify(flow.steps), 'manual', created.length);
      created.push(Number(result.lastInsertRowid));
    }
    res.json({ created: created.length, ids: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List flows for a project with their recent runs embedded (eliminates N+1)
router.get('/project/:projectId/with-runs', (req, res) => {
  try {
    const flows = db.prepare('SELECT * FROM flows WHERE project_id = ? ORDER BY order_index ASC, created_at ASC').all(req.params.projectId) as any[];
    if (flows.length === 0) return res.json([]);

    const flowIds = flows.map((f: any) => f.id);
    const placeholders = flowIds.map(() => '?').join(',');
    const runs = db.prepare(
      `SELECT * FROM runs WHERE flow_id IN (${placeholders}) ORDER BY created_at DESC`
    ).all(...flowIds) as any[];

    // Group runs by flow_id (already sorted DESC, keep latest 3 per flow)
    const runsByFlow: Record<number, any[]> = {};
    for (const run of runs) {
      if (!runsByFlow[run.flow_id]) runsByFlow[run.flow_id] = [];
      if (runsByFlow[run.flow_id].length < 10) runsByFlow[run.flow_id].push(run);
    }

    const result = flows.map((f: any) => ({
      ...f,
      steps: JSON.parse(f.steps),
      runs: runsByFlow[f.id] || [],
    }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List flows for a project
router.get('/project/:projectId', (req, res) => {
  try {
    const flows = db.prepare('SELECT * FROM flows WHERE project_id = ? ORDER BY order_index ASC, created_at ASC').all(req.params.projectId);
    const result = (flows as any[]).map((f: any) => ({ ...f, steps: JSON.parse(f.steps) }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single flow
router.get('/:id', (req, res) => {
  try {
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id) as any;
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    res.json({ ...flow, steps: JSON.parse(flow.steps) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clone a flow
router.post('/:id/clone', (req, res) => {
  try {
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id) as any;
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    const result = db.prepare('INSERT INTO flows (project_id, name, steps, type, script, retry_on_failure) VALUES (?, ?, ?, ?, ?, ?)')
      .run(flow.project_id, `${flow.name} (copy)`, flow.steps, flow.type, flow.script, flow.retry_on_failure);
    const newFlow = db.prepare('SELECT * FROM flows WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    res.status(201).json({ ...newFlow, steps: JSON.parse(newFlow.steps) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create flow
router.post('/', (req, res) => {
  try {
    const { project_id, name, steps, type, script, retry_on_failure } = req.body;
    if (!project_id || !name) return res.status(400).json({ error: 'project_id and name are required' });
    const stepsJson = JSON.stringify(steps || []);
    const flowType = type || 'manual';
    const flowScript = script || null;
    const retryFlag = retry_on_failure ? 1 : 0;
    const result = db.prepare('INSERT INTO flows (project_id, name, steps, type, script, retry_on_failure) VALUES (?, ?, ?, ?, ?, ?)').run(project_id, name, stepsJson, flowType, flowScript, retryFlag);
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    res.status(201).json({ ...flow, steps: JSON.parse(flow.steps) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update flow
router.put('/:id', (req, res) => {
  try {
    const { name, steps, retry_on_failure } = req.body;
    db.prepare('UPDATE flows SET name = ?, steps = ?, retry_on_failure = ? WHERE id = ?')
      .run(name, JSON.stringify(steps || []), retry_on_failure ? 1 : 0, req.params.id);
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id) as any;
    res.json({ ...flow, steps: JSON.parse(flow.steps) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete flow
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM flows WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder flows — accepts [{id, order_index}]
router.put('/project/:projectId/reorder', (req, res) => {
  try {
    const updates = req.body as { id: number; order_index: number }[];
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected array of {id, order_index}' });
    const stmt = db.prepare('UPDATE flows SET order_index = ? WHERE id = ?');
    for (const { id, order_index } of updates) stmt.run(order_index, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
