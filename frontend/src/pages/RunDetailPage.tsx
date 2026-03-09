import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { runsApi, Run, Screenshot } from '../api';
import StatusBadge from '../components/StatusBadge';
import { useNavigate } from 'react-router-dom';

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<(Run & { screenshots: Screenshot[] }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    if (!id) return;
    const data = await runsApi.get(parseInt(id));
    setRun(data);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!run) return;
    if (run.status === 'pending' || run.status === 'running') {
      const interval = setInterval(load, 1500);
      return () => clearInterval(interval);
    }
  }, [run?.status]);

  const handleCopyError = () => {
    if (!run) return;
    const failureShot = run.screenshots.find(s => s.label === 'failure');
    const report = [
      `=== maiflow Test Failure Report ===`,
      `Run ID   : #${run.id}`,
      `Status   : FAILED`,
      `Duration : ${run.duration_ms ? (run.duration_ms / 1000).toFixed(2) + 's' : 'N/A'}`,
      ``,
      `--- Error ---`,
      run.error_message || 'Unknown error',
      ``,
      `--- Last Step ---`,
      run.current_step || 'N/A',
      ``,
      failureShot ? `--- Screenshot: ${failureShot.filename} ---` : '',
      ``,
      `Paste this to Claude to get a fix.`,
    ].filter(l => l !== undefined).join('\n');
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!run) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 700 }}>
        {[120, 80, 200].map((h, i) => (
          <div key={i} className="skeleton" style={{ height: h, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  const isRunning = run.status === 'pending' || run.status === 'running';
  const failureShot = run.screenshots.find(s => s.label === 'failure');
  const passShot    = run.screenshots.find(s => s.label === 'final-pass');
  const stepShots   = run.screenshots.filter(s => s.label !== 'failure' && s.label !== 'final-pass');

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Dashboard
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <h1 className="mono" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Run #{run.id}</h1>
          <StatusBadge status={run.status} />
          {run.duration_ms && (
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-subtle)', marginLeft: 4 }}>
              {(run.duration_ms / 1000).toFixed(2)}s
            </span>
          )}
          {isRunning && (
            <button
              disabled={cancelling}
              className="btn btn-warning btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={async () => {
                setCancelling(true);
                try { await runsApi.cancel(run.id); load(); }
                finally { setCancelling(false); }
              }}
            >
              {cancelling ? '…' : '⏹ Stop Run'}
            </button>
          )}
        </div>
      </div>

      {/* Live view */}
      {isRunning && (
        <div className="card animate-slide-up" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div className="live-bar" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="status-dot running" />
            <span style={{ fontSize: 13, color: 'var(--running)', fontWeight: 500 }}>
              {run.current_step || 'Starting…'}
            </span>
          </div>
          {run.live_screenshot ? (
            <img src={`/api/screenshots/${run.live_screenshot}?t=${Date.now()}`} alt="Live view" style={{ width: '100%', display: 'block' }} />
          ) : (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
              Waiting for first screenshot…
            </div>
          )}
        </div>
      )}

      {/* Failed */}
      {run.status === 'failed' && (
        <div style={{ marginBottom: 16 }}>
          <div className="card" style={{ padding: 20, borderColor: 'rgba(248,113,113,0.2)', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="status-dot failed" />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--error)' }}>Test Failed</span>
              </div>
              <button onClick={handleCopyError} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                {copied ? '✓ Copied' : '⎘ Copy for Claude'}
              </button>
            </div>
            {run.current_step && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                <span style={{ color: 'var(--error)', marginRight: 6 }}>Failed at:</span>{run.current_step}
              </div>
            )}
            <pre className="mono" style={{
              fontSize: 12, color: 'var(--error)',
              background: 'var(--error-bg)', border: '1px solid rgba(248,113,113,0.12)',
              borderRadius: 8, padding: '12px 14px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
              maxHeight: 200, overflow: 'auto',
            }}>
              {run.error_message || 'Unknown error'}
            </pre>
          </div>

          {failureShot && (
            <div className="card" style={{ overflow: 'hidden', borderColor: 'rgba(248,113,113,0.15)' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--error)' }}>
                📸 Browser state when test failed
              </div>
              <img src={`/api/screenshots/${failureShot.filename}`} alt="Failure screenshot" style={{ width: '100%', display: 'block' }} />
            </div>
          )}
        </div>
      )}

      {/* Passed */}
      {run.status === 'passed' && (
        <div className="card animate-slide-up" style={{ padding: 20, borderColor: 'rgba(52,211,153,0.2)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: passShot ? 14 : 0 }}>
            <span className="status-dot passed" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>All checks passed</span>
          </div>
          {passShot && (
            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(52,211,153,0.12)' }}>
              <img src={`/api/screenshots/${passShot.filename}`} alt="Final state" style={{ width: '100%', display: 'block' }} />
            </div>
          )}
        </div>
      )}

      {/* Step screenshots */}
      {stepShots.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>Step Screenshots</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {stepShots.map(ss => (
              <div key={ss.id} className="card" style={{ overflow: 'hidden' }}>
                <div className="mono" style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  {ss.label}
                </div>
                <img src={`/api/screenshots/${ss.filename}`} alt={ss.label} style={{ width: '100%', display: 'block' }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
