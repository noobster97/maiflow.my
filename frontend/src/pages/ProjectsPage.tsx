import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { projectsApi, Project } from '../api';

const SCHEDULE_OPTIONS = [
  { value: '',          label: 'No schedule' },
  { value: 'every_30m', label: 'Every 30 min' },
  { value: 'hourly',    label: 'Every hour' },
  { value: 'every_6h',  label: 'Every 6 hours' },
  { value: 'daily',     label: 'Daily at 8am' },
];

function parseUtc(d: string): Date {
  return (!d.includes('T') && !d.endsWith('Z')) ? new Date(d.replace(' ', 'T') + 'Z') : new Date(d);
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - parseUtc(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function HealthBar({ passing, total }: { passing: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((passing / total) * 100);
  const color = pct === 100 ? 'var(--success)' : pct === 0 ? 'var(--error)' : 'var(--warning)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', base_url: '', description: '', schedule: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => projectsApi.list().then(setProjects);
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await projectsApi.create(form);
      setForm({ name: '', base_url: '', description: '', schedule: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.4px' }}>Projects</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Project
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card animate-slide-up" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>New Project</h3>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input className="field" placeholder="Project name" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} required />
              <input className="field" placeholder="Base URL · https://myapp.com" value={form.base_url}
                onChange={e => setForm({ ...form, base_url: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <input className="field" placeholder="Description (optional)" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })} />
              <select className="field" value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })}>
                {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Creating…' : 'Create Project'}</button>
              <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Project list */}
      {projects.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.12 }}>◫</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Create your first project to start testing.</div>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'grid', gap: 8 }}>
          {projects.map(project => {
            const total   = project.total_flows ?? 0;
            const passing = project.passing_flows ?? 0;
            const failing = project.failing_flows ?? 0;
            const allPass = total > 0 && failing === 0 && passing > 0;
            const anyFail = failing > 0;

            return (
              <Link key={project.id} to={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                <div className="card interactive" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                          background: allPass ? 'var(--success)' : anyFail ? 'var(--error)' : 'var(--text-subtle)',
                          boxShadow: allPass ? '0 0 6px var(--success)' : anyFail ? '0 0 6px var(--error)' : 'none',
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{project.name}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 6 }}>{project.base_url}</div>
                      {project.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{project.description}</div>
                      )}
                      {total > 0 && <HealthBar passing={passing} total={total} />}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {total > 0 ? (
                        <>
                          <div style={{ fontSize: 11, color: anyFail ? 'var(--error)' : allPass ? 'var(--success)' : 'var(--text-muted)', fontWeight: 500, marginBottom: 2 }}>
                            {anyFail ? `${failing} failing` : `${passing}/${total} passing`}
                          </div>
                          {project.last_run_at && (
                            <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{timeAgo(project.last_run_at)}</div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>No flows</div>
                      )}
                      {project.schedule && (
                        <div style={{ fontSize: 10, color: 'var(--running)', marginTop: 4 }}>
                          ⏱ {SCHEDULE_OPTIONS.find(o => o.value === project.schedule)?.label}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
