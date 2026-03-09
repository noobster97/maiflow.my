import { Router } from 'express';
import { startRecording, stopRecording, isSessionActive } from '../services/recorder';

const router = Router();

// Start a recording session — opens playwright codegen browser
router.post('/start', (req, res) => {
  try {
    const { base_url } = req.body;
    if (!base_url) return res.status(400).json({ error: 'base_url is required' });
    if (!base_url.startsWith('http://') && !base_url.startsWith('https://')) {
      return res.status(400).json({ error: 'base_url must start with http:// or https://' });
    }

    const sessionId = startRecording(base_url);
    res.json({ session_id: sessionId, message: 'Recording started. Use the browser that opened on your screen.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stop recording — kills codegen, returns captured script
router.post('/stop/:sessionId', (req, res) => {
  try {
    const result = stopRecording(req.params.sessionId);
    if (!result) return res.status(404).json({ error: 'Session not found or already stopped' });
    res.json({ script: result.script });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check if session is still active
router.get('/status/:sessionId', (req, res) => {
  res.json({ active: isSessionActive(req.params.sessionId) });
});

export default router;
