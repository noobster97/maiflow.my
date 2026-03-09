import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'maiflow.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flow_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    error_message TEXT DEFAULT NULL,
    duration_ms INTEGER DEFAULT NULL,
    started_at DATETIME DEFAULT NULL,
    finished_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    label TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
  );
`);

// Migrations — add new columns if they don't exist yet
try { db.exec(`ALTER TABLE flows ADD COLUMN type TEXT DEFAULT 'manual'`); } catch {}
try { db.exec(`ALTER TABLE flows ADD COLUMN script TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE runs ADD COLUMN current_step TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE runs ADD COLUMN live_screenshot TEXT DEFAULT NULL`); } catch {}

// New column migrations
try { db.exec(`ALTER TABLE projects ADD COLUMN schedule TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE flows ADD COLUMN retry_on_failure INTEGER DEFAULT 0`); } catch {}

// Indexes for query performance
db.exec(`CREATE INDEX IF NOT EXISTS idx_flows_project_id ON flows(project_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_flow_id ON runs(flow_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_screenshots_run_id ON screenshots(run_id)`);

export default db;
export { SCREENSHOTS_DIR };
