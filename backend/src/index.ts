import express from 'express';
import cors from 'cors';
import db from './db';
import projectsRouter from './routes/projects';
import flowsRouter from './routes/flows';
import runsRouter from './routes/runs';
import screenshotsRouter from './routes/screenshots';
import recorderRouter from './routes/recorder';
import { initScheduler } from './services/scheduler';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/projects', projectsRouter);
app.use('/api/flows', flowsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/screenshots', screenshotsRouter);
app.use('/api/recorder', recorderRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'maiflow-backend' });
});

app.listen(PORT, () => {
  console.log(`maiflow backend running on http://localhost:${PORT}`);

  // Mark any runs that were left in running/pending state (server restart mid-run)
  const orphaned = db.prepare(`
    UPDATE runs
    SET status = 'failed',
        error_message = 'Server restarted while test was running.',
        finished_at = CURRENT_TIMESTAMP
    WHERE status IN ('running', 'pending')
  `).run();
  if (orphaned.changes > 0)
    console.log(`[startup] Marked ${orphaned.changes} orphaned run(s) as failed`);

  initScheduler();
});
