import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

interface Session {
  process: ChildProcess;
  outputFile: string;
}

const sessions = new Map<string, Session>();

export function startRecording(baseUrl: string): string {
  const sessionId = uuidv4();
  const outputFile = path.join(RECORDINGS_DIR, `recording_${sessionId}.spec.ts`);

  const proc = spawn('npx', ['playwright', 'codegen', `--output=${outputFile}`, baseUrl], {
    shell: true,
    stdio: 'ignore',
  });

  sessions.set(sessionId, { process: proc, outputFile });
  return sessionId;
}

export function stopRecording(sessionId: string): { script: string } | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Kill the codegen process (Windows-safe)
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${session.process.pid} /f /t 2>nul`, { stdio: 'ignore' });
    } else {
      session.process.kill('SIGTERM');
    }
  } catch {}

  sessions.delete(sessionId);

  // Small wait to ensure file is flushed
  let script = '';
  if (fs.existsSync(session.outputFile)) {
    script = fs.readFileSync(session.outputFile, 'utf-8');
    try { fs.unlinkSync(session.outputFile); } catch {}
  }

  return { script };
}

export function isSessionActive(sessionId: string): boolean {
  return sessions.has(sessionId);
}
