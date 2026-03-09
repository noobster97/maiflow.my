import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { runsApi, Run } from '../api';
import StatusBadge from '../components/StatusBadge';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div className="mono" style={{ fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="status-dot" style={{ background: color, boxShadow: `0 0 5px ${color}`, width: 5, height: 5 }} />
        {label}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
      <div className="skeleton" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }} />
      <div className="skeleton" style={{ height: 13, flex: 1, maxWidth: 220 }} />
      <div className="skeleton" style={{ height: 13, width: 70, marginLeft: 'auto' }} />
      <div className="skeleton" style={{ height: 22, width: 64, borderRadius: 20 }} />
    </div>
  );
}

type Filter = 'all' | 'passed' | 'failed' | 'running';

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const load = async () => {
    try {
      const data = await runsApi.recent(30);
      setRuns(data);
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
        <StatCard label="Passed" value={passed} color="var(--success)" />
        <StatCard label="Failed"  value={failed}  color="var(--error)" />
        <StatCard label="Running" value={running} color="var(--running)" />
      </div>

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
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.15 }}>◎</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {filter === 'all' ? 'No runs yet — go to a project and run a flow.' : `No ${filter} runs.`}
            </div>
          </div>
        ) : (
          <div>
            {filtered.map((run, i) => (
              <Link key={run.id} to={`/runs/${run.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className={`status-dot ${run.status}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{run.flow_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>in {run.project_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {run.duration_ms && (
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                        {(run.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{timeAgo(run.created_at)}</span>
                    <StatusBadge status={run.status} small />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
