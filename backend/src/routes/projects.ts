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
    const { name, base_url, description, schedule } = req.body;
    if (!name || !base_url) return res.status(400).json({ error: 'name and base_url are required' });
    if (!base_url.startsWith('http://') && !base_url.startsWith('https://')) {
      return res.status(400).json({ error: 'base_url must start with http:// or https://' });
    }
    const result = db.prepare('INSERT INTO projects (name, base_url, description, schedule) VALUES (?, ?, ?, ?)').run(name, base_url, description || '', schedule || null);
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
    const { name, base_url, description, schedule } = req.body;
    if (base_url && !base_url.startsWith('http://') && !base_url.startsWith('https://')) {
      return res.status(400).json({ error: 'base_url must start with http:// or https://' });
    }
    db.prepare('UPDATE projects SET name = ?, base_url = ?, description = ?, schedule = ? WHERE id = ?')
      .run(name, base_url, description, schedule || null, req.params.id);
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

export default router;
