import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { flowsApi, runsApi, projectsApi, Flow, Run, Project } from '../api';
import StatusBadge from '../components/StatusBadge';

function PassRateChart({ runs }: { runs: Run[] }) {
  const last20 = [...runs].slice(0, 20).reverse();
  if (last20.length === 0) return null;

  const BAR_W = 10;
  const BAR_GAP = 3;
  const HEIGHT = 36;
  const width = last20.length * (BAR_W + BAR_GAP) - BAR_GAP;

  return (
    <svg width={width} height={HEIGHT} style={{ display: 'block' }}>
      {last20.map((run, i) => {
        const color =
          run.status === 'passed' ? 'var(--success)' :
          run.status === 'failed' ? 'var(--error)' :
          'var(--text-subtle)';
        const x = i * (BAR_W + BAR_GAP);
        return (
          <rect
            key={run.id}
            x={x} y={0}
            width={BAR_W} height={HEIGHT}
            rx={3}
            fill={color}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

function StepRow({ index, step }: { index: number; step: Record<string, any> }) {
  const { action, ...rest } = step;
  const details = Object.entries(rest)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');

  const actionColor: Record<string, string> = {
    navigate: 'var(--accent)',
    fill: '#a78bfa',
    click: '#60a5fa',
    screenshot: '#34d399',
    assert_url: '#fbbf24',
    assert_text: '#fbbf24',
    wait: 'var(--text-muted)',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 24, paddingTop: 2 }}>
        {index + 1}
      </span>
      <span className="mono" style={{
        fontSize: 12, fontWeight: 600,
        color: actionColor[action] || 'var(--text-muted)',
        minWidth: 100,
        paddingTop: 2,
      }}>
        {action}
      </span>
      <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
        {details}
      </span>
    </div>
  );
}

export default function FlowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'steps'>('history');

  const load = async () => {
    if (!id) return;
    const f = await flowsApi.get(parseInt(id));
    setFlow(f);
    const [r, p] = await Promise.all([
      runsApi.listByFlow(f.id),
      projectsApi.get(f.project_id),
    ]);
    setRuns(r);
    setProject(p);
  };

  useEffect(() => { load(); }, [id]);

  // Poll while any run is active
  useEffect(() => {
    const hasActive = runs.some(r => r.status === 'pending' || r.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [runs]);

  const handleRun = async () => {
    if (!flow) return;
    setTriggering(true);
    try {
      const { run_id } = await runsApi.trigger(flow.id);
      navigate(`/runs/${run_id}`);
    } finally {
      setTriggering(false);
    }
  };

  // Stats
  const totalRuns = runs.length;
  const passedRuns = runs.filter(r => r.status === 'passed').length;
  const failedRuns = runs.filter(r => r.status === 'failed').length;
  const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : null;
  const lastRun = runs[0] ?? null;
  const avgDuration = (() => {
    const finished = runs.filter(r => r.duration_ms);
    if (!finished.length) return null;
    const avg = finished.reduce((s, r) => s + r.duration_ms!, 0) / finished.length;
    return (avg / 1000).toFixed(1);
  })();

  const passRateColor =
    passRate === null ? 'var(--text-subtle)' :
    passRate >= 80 ? 'var(--success)' :
    passRate >= 50 ? '#fbbf24' :
    'var(--error)';

  if (!flow || !project) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860 }}>
        {[60, 100, 300].map((h, i) => (
          <div key={i} className="skeleton" style={{ height: h, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  const steps: Record<string, any>[] = Array.isArray(flow.steps) ? flow.steps : [];

  return (
    <div style={{ maxWidth: 860 }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link to={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            {project.name}
          </span>
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>{flow.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: flow.type === 'recorded' ? 'rgba(167,139,250,0.12)' : 'rgba(99,102,241,0.12)',
              color: flow.type === 'recorded' ? '#a78bfa' : 'var(--accent)',
              border: `1px solid ${flow.type === 'recorded' ? 'rgba(167,139,250,0.2)' : 'rgba(99,102,241,0.2)'}`,
            }}>
              {flow.type === 'recorded' ? '⏺ recorded' : '⚡ manual'}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
              background: flow.retry_on_failure ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)',
              color: flow.retry_on_failure ? 'var(--success)' : 'var(--text-subtle)',
              border: `1px solid ${flow.retry_on_failure ? 'rgba(52,211,153,0.15)' : 'var(--border)'}`,
            }}>
              {flow.retry_on_failure ? '↺ retry on' : '↺ retry off'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
              ID #{flow.id}
            </span>
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={triggering}
          className="btn btn-primary"
          style={{ flexShrink: 0 }}
        >
          {triggering ? '…' : '▶ Run Now'}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Pass Rate', value: passRate !== null ? `${passRate}%` : '—', color: passRateColor },
          { label: 'Total Runs', value: totalRuns, color: 'var(--text)' },
          { label: 'Avg Duration', value: avgDuration ? `${avgDuration}s` : '—', color: 'var(--text-muted)' },
          { label: 'Last Status', value: lastRun ? lastRun.status : 'never run',
            color: lastRun?.status === 'passed' ? 'var(--success)' : lastRun?.status === 'failed' ? 'var(--error)' : 'var(--text-subtle)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6 }}>{s.label}</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{String(s.value)}</div>
          </div>
        ))}
      </div>

      {/* Pass rate chart */}
      {runs.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              Last {Math.min(runs.length, 20)} runs
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'var(--text-subtle)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--success)', display: 'inline-block' }}/>
                passed ({passedRuns})
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--error)', display: 'inline-block' }}/>
                failed ({failedRuns})
              </span>
            </div>
          </div>
          <PassRateChart runs={runs} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {(['history', 'steps'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 18px',
              fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-subtle)',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              textTransform: 'capitalize',
            }}
          >
            {tab === 'history' ? `Run History (${totalRuns})` : `Steps (${steps.length})`}
          </button>
        ))}
      </div>

      {/* Run History */}
      {activeTab === 'history' && (
        <div>
          {runs.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
              No runs yet. Hit <strong>Run Now</strong> to start.
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Run', 'Status', 'Duration', 'Started', 'Error'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left',
                        fontSize: 11, fontWeight: 600,
                        color: 'var(--text-subtle)', letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, i) => (
                    <tr
                      key={run.id}
                      style={{
                        borderBottom: i < runs.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onClick={() => navigate(`/runs/${run.id}`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="mono" style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                        #{run.id}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="mono" style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-subtle)', fontSize: 12 }}>
                        {run.started_at ? new Date(run.started_at.includes('T') ? run.started_at : run.started_at.replace(' ', 'T') + 'Z').toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', maxWidth: 260 }}>
                        {run.error_message ? (
                          <span className="mono" style={{
                            fontSize: 11, color: 'var(--error)',
                            display: 'block', overflow: 'hidden',
                            whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            maxWidth: 240,
                          }}>
                            {run.error_message}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Steps */}
      {activeTab === 'steps' && (
        <div>
          {flow.type === 'recorded' ? (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                Playwright script (recorded)
              </div>
              <pre className="mono" style={{
                padding: '16px 20px', margin: 0,
                fontSize: 12, color: 'var(--text-muted)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 480, overflowY: 'auto',
                lineHeight: 1.6,
              }}>
                {flow.script || 'No script recorded.'}
              </pre>
            </div>
          ) : steps.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
              No steps defined.
            </div>
          ) : (
            <div className="card" style={{ padding: '0 20px' }}>
              {steps.map((step, i) => (
                <StepRow key={i} index={i} step={step} />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
