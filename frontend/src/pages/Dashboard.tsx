import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { runsApi, projectsApi, Run, Project } from '../api';
import StatusBadge from '../components/StatusBadge';

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

const STATUS_COLOR: Record<string, string> = {
  passed:  'var(--success)',
  failed:  'var(--error)',
  running: 'var(--running)',
  pending: 'var(--running)',
};

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className="card" style={{ padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
      {/* Glow blob */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: color, opacity: 0.06, filter: 'blur(20px)',
        pointerEvents: 'none',
      }} />
      <div style={{ fontSize: 26, marginBottom: 10, lineHeight: 1 }}>{icon}</div>
      <div className="mono" style={{ fontSize: 40, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{label}</div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderLeft: '3px solid var(--border)' }}>
      <div className="skeleton" style={{ height: 13, flex: 1, maxWidth: 220 }} />
      <div className="skeleton" style={{ height: 22, width: 64, borderRadius: 20 }} />
    </div>
  );
}

type Filter = 'all' | 'passed' | 'failed' | 'running';

export default function Dashboard() {
  const [runs, setRuns]         = useState<Run[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<Filter>('all');

  const load = async () => {
    try {
      const [runsData, projectsData] = await Promise.all([
        runsApi.recent(100),
        projectsApi.list(),
      ]);
      setRuns(runsData);
      setProjects(projectsData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const passed  = runs.filter(r => r.status === 'passed').length;
  const failed  = runs.filter(r => r.status === 'failed').length;
  const running = runs.filter(r => r.status === 'running' || r.status === 'pending').length;

  const filtered = filter === 'all' ? runs : runs.filter(r => {
    if (filter === 'running') return r.status === 'running' || r.status === 'pending';
    return r.status === filter;
  });

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.4px' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Live overview · updates every 3s</p>
      </div>

      {/* Stats */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
        <StatCard label="Passed (last 100)" value={passed} color="var(--success)" icon="✅" />
        <StatCard label="Failed (last 100)"  value={failed}  color="var(--error)"   icon="❌" />
        <StatCard label="Running now"        value={running} color="var(--running)" icon="⚡" />
      </div>

      {/* Project Health */}
      {projects.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>Project Health</div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {projects.map((p, i) => {
              const total   = p.total_flows   ?? 0;
              const passing = p.passing_flows ?? 0;
              const failing = p.failing_flows ?? 0;
              const other   = total - passing - failing;
              const pct     = total > 0 ? Math.round((passing / total) * 100) : null;
              return (
                <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '11px 20px',
                    borderBottom: i < projects.length - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: `3px solid ${failing > 0 ? 'var(--error)' : passing === total && total > 0 ? 'var(--success)' : 'var(--border)'}`,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                        {total === 0 ? 'No flows' : (
                          <>
                            <span style={{ color: 'var(--success)' }}>{passing} passed</span>
                            {failing > 0 && <> · <span style={{ color: 'var(--error)' }}>{failing} failed</span></>}
                            {other > 0 && <> · <span>{other} pending/running</span></>}
                            <span> · {total} total</span>
                          </>
                        )}
                      </div>
                    </div>
                    {pct !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <div style={{ width: 72, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${pct}%`,
                            background: pct === 100 ? 'var(--success)' : pct === 0 ? 'var(--error)' : 'linear-gradient(90deg, var(--error), var(--success))',
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <span className="mono" style={{ fontSize: 11, color: pct === 100 ? 'var(--success)' : pct === 0 ? 'var(--error)' : 'var(--warning)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Header + filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Recent Runs</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {(['all', 'passed', 'failed', 'running'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="btn btn-xs btn-ghost" style={{
              borderColor: filter === f ? 'var(--border-hover)' : 'transparent',
              color: filter === f ? 'var(--text)' : 'var(--text-muted)',
              background: filter === f ? 'rgba(255,255,255,0.05)' : 'transparent',
              textTransform: 'capitalize',
            }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <>{[1,2,3,4,5].map(i => <SkeletonRow key={i} />)}</>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.12 }}>◎</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              {filter === 'all' ? 'No runs yet' : `No ${filter} runs`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
              {filter === 'all' ? 'Go to a project and run a flow to see results here.' : 'Try a different filter.'}
            </div>
          </div>
        ) : (
          <div>
            {filtered.map((run, i) => {
              const borderColor = STATUS_COLOR[run.status] || 'var(--border)';
              return (
                <Link key={run.id} to={`/runs/${run.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 20px',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: `3px solid ${borderColor}`,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.flow_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                        {run.project_name} · {timeAgo(run.created_at)}
                        {run.duration_ms && (
                          <span className="mono" style={{ marginLeft: 8 }}>{(run.duration_ms / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={run.status} small />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
