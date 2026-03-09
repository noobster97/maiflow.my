import { Router } from 'express';
import path from 'path';
import { SCREENSHOTS_DIR } from '../db';

const router = Router();

router.get('/:filename', (req, res) => {
  const filename = req.params.filename;
  // Basic security: only allow alphanumeric, underscore, dash, dot
  if (!/^[\w\-.]+\.png$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  res.sendFile(filepath, (err) => {
    if (err) res.status(404).json({ error: 'Screenshot not found' });
  });
});

export default router;
