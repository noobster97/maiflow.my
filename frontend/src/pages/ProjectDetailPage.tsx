import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { projectsApi, flowsApi, runsApi, recorderApi, Project, Flow, Run } from '../api';
import StatusBadge from '../components/StatusBadge';
import FlowBuilder from '../components/FlowBuilder';

type FlowWithRuns = Flow & { runs: Run[] };

const SCHEDULE_OPTIONS = [
  { value: '',          label: 'No schedule' },
  { value: 'every_30m', label: 'Every 30 min' },
  { value: 'hourly',    label: 'Every hour' },
  { value: 'every_6h',  label: 'Every 6 hours' },
  { value: 'daily',     label: 'Daily at 8am' },
];

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}
function showFailureNotification(flowName: string) {
  if ('Notification' in window && Notification.permission === 'granted')
    new Notification('Test Failed', { body: `${flowName} failed.` });
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function passRate(runs: Run[]) {
  const finished = runs.filter(r => r.status === 'passed' || r.status === 'failed');
  if (finished.length === 0) return null;
  const passed = finished.filter(r => r.status === 'passed').length;
  return { passed, total: finished.length, pct: Math.round((passed / finished.length) * 100) };
}

function IconBtn({ onClick, title, children, hoverColor }: { onClick: () => void; title: string; children: React.ReactNode; hoverColor?: string }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} title={title} style={{
      background: h ? 'rgba(255,255,255,0.05)' : 'none',
      border: 'none', cursor: 'pointer', padding: '4px 7px', borderRadius: 5,
      color: h ? (hoverColor || 'var(--text)') : 'var(--text-subtle)',
      transition: 'all 0.15s', fontSize: 13, lineHeight: 1,
    }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      {children}
    </button>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject]               = useState<Project | null>(null);
  const [flows, setFlows]                   = useState<FlowWithRuns[]>([]);
  const [banner, setBanner]                 = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [showFlowForm, setShowFlowForm]     = useState(false);
  const [newFlowName, setNewFlowName]       = useState('');
  const [newFlowSteps, setNewFlowSteps]     = useState<any[]>([]);
  const [saving, setSaving]                 = useState(false);
  const [triggering, setTriggering]         = useState<number | null>(null);
  const [cancelling, setCancelling]         = useState<number | null>(null);
  const [runningAll, setRunningAll]         = useState(false);
  const [importing, setImporting]           = useState(false);
  const [cloning, setCloning]               = useState<number | null>(null);
  const [deleting, setDeleting]             = useState<number | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projectForm, setProjectForm]       = useState({ name: '', base_url: '', description: '', schedule: '' });
  const [savingProject, setSavingProject]   = useState(false);
  const [editingFlow, setEditingFlow]       = useState<number | null>(null);
  const [editFlowName, setEditFlowName]     = useState('');
  const [editFlowSteps, setEditFlowSteps]   = useState<any[]>([]);
  const [savingEdit, setSavingEdit]         = useState(false);
  const [clearingRuns, setClearingRuns]     = useState(false);
  const [clearConfirm, setClearConfirm]     = useState(false);
  const [clearingFlows, setClearingFlows]   = useState(false);
  const [clearFlowsConfirm, setClearFlowsConfirm] = useState(false);

  // Recorder
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [recordingScript, setRecordingScript]       = useState('');
  const [recordFlowName, setRecordFlowName]         = useState('');
  const [recordExpectedUrl, setRecordExpectedUrl]   = useState('');
  const [recordExpectedText, setRecordExpectedText] = useState('');
  const [savingRecorded, setSavingRecorded]         = useState(false);

  const prevFlowsRef = useRef<FlowWithRuns[]>([]);

  const notify = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setBanner({ msg, type });
    setTimeout(() => setBanner(null), 4000);
  };

  const loadFlows = async () => {
    if (!id) return;
    const data = await flowsApi.listByProjectWithRuns(parseInt(id));
    const prev = prevFlowsRef.current;
    for (const flow of data) {
      const prevFlow = prev.find(f => f.id === flow.id);
      if (!prevFlow) continue;
      const pr = prevFlow.runs[0], cr = flow.runs[0];
      if (pr && cr && pr.id === cr.id && (pr.status === 'running' || pr.status === 'pending') && cr.status === 'failed')
        showFailureNotification(flow.name);
    }
    prevFlowsRef.current = data;
    setFlows(data);
  };

  useEffect(() => {
    if (!id) return;
    projectsApi.get(parseInt(id)).then(p => {
      setProject(p);
      setProjectForm({ name: p.name, base_url: p.base_url, description: p.description, schedule: p.schedule || '' });
    });
    loadFlows();
    requestNotificationPermission();
    const interval = setInterval(loadFlows, 3000);
    return () => clearInterval(interval);
  }, [id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFlowForm(false);
        setEditingProject(false);
        setDeleting(null);
        setDeletingProject(false);
        setEditingFlow(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await flowsApi.create({ project_id: parseInt(id), name: newFlowName, steps: newFlowSteps });
      setNewFlowName(''); setNewFlowSteps([]); setShowFlowForm(false);
      loadFlows(); notify('Flow created.');
    } finally { setSaving(false); }
  };

  const handleRun = async (flowId: number) => {
    setTriggering(flowId);
    try {
      await runsApi.trigger(flowId);
      setTimeout(loadFlows, 500);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to start run.';
      notify(msg, 'err');
    } finally { setTriggering(null); }
  };

  const handleCancel = async (runId: number) => {
    setCancelling(runId);
    try { await runsApi.cancel(runId); setTimeout(loadFlows, 300); }
    finally { setCancelling(null); }
  };

  const handleRunAll = async () => {
    if (!id) return;
    setRunningAll(true);
    try {
      const result = await runsApi.runAll(parseInt(id));
      notify(`Started ${result.run_ids.length} runs.`);
      setTimeout(loadFlows, 800);
    } finally { setRunningAll(false); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files?.[0]) return;
    setImporting(true);
    try {
      const text = await e.target.files[0].text();
      const result = await flowsApi.import(parseInt(id), JSON.parse(text));
      notify(`Imported ${result.created} flows.`);
      loadFlows();
    } catch { notify('Invalid JSON — check the template format.', 'err'); }
    finally { setImporting(false); e.target.value = ''; }
  };

  const handleStartRecording = async () => {
    if (!project) return;
    try {
      const { session_id } = await recorderApi.start(project.base_url);
      setRecordingSessionId(session_id); setRecordingScript(''); setRecordFlowName('');
    } catch (err: any) { notify(err.response?.data?.error || 'Could not start recording.', 'err'); }
  };

  const handleStopRecording = async () => {
    if (!recordingSessionId) return;
    try {
      const { script } = await recorderApi.stop(recordingSessionId);
      setRecordingScript(script);
    } catch (err: any) { notify(err.response?.data?.error || 'Could not stop recording.', 'err'); }
    finally { setRecordingSessionId(null); }
  };

  const handleSaveRecordedFlow = async () => {
    if (!id || !recordFlowName.trim() || !recordingScript.trim()) return;
    setSavingRecorded(true);
    let finalScript = recordingScript;
    const asserts: string[] = [];
    if (recordExpectedUrl.trim()) asserts.push(`  await expect(page).toHaveURL(/${recordExpectedUrl.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/);`);
    if (recordExpectedText.trim()) asserts.push(`  await expect(page.locator('body')).toContainText(${JSON.stringify(recordExpectedText.trim())});`);
    if (asserts.length > 0) finalScript = recordingScript.replace(/\}\s*\)\s*;?\s*$/, `\n${asserts.join('\n')}\n});`);
    try {
      await flowsApi.create({ project_id: parseInt(id), name: recordFlowName, steps: [], type: 'recorded', script: finalScript } as any);
      setRecordingScript(''); setRecordFlowName(''); setRecordExpectedUrl(''); setRecordExpectedText('');
      loadFlows(); notify('Recorded flow saved.');
    } finally { setSavingRecorded(false); }
  };

  const handleCloneFlow = async (flowId: number) => {
    setCloning(flowId);
    try { await flowsApi.clone(flowId); loadFlows(); notify('Flow cloned.'); }
    finally { setCloning(null); }
  };

  const handleToggleRetry = async (flow: FlowWithRuns) => {
    await flowsApi.update(flow.id, { name: flow.name, steps: flow.steps, retry_on_failure: flow.retry_on_failure ? 0 : 1 } as any);
    loadFlows();
  };

  const handleStartEdit = (flow: FlowWithRuns) => {
    setEditingFlow(flow.id);
    setEditFlowName(flow.name);
    setEditFlowSteps(flow.steps);
  };

  const handleSaveEdit = async (flowId: number) => {
    setSavingEdit(true);
    try {
      await flowsApi.update(flowId, { name: editFlowName, steps: editFlowSteps } as any);
      setEditingFlow(null);
      loadFlows();
      notify('Flow updated.');
    } finally { setSavingEdit(false); }
  };

  const handleDeleteFlow = (flowId: number) => setDeleting(flowId);
  const confirmDelete = async (flowId: number) => {
    await flowsApi.delete(flowId);
    setDeleting(null);
    loadFlows();
    notify('Flow deleted.');
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingProject(true);
    try {
      const updated = await projectsApi.update(parseInt(id), projectForm);
      setProject(updated);
      setEditingProject(false);
      notify('Project settings saved.');
    } finally { setSavingProject(false); }
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    await projectsApi.delete(parseInt(id));
    navigate('/projects');
  };

  const handleClearRuns = async () => {
    if (!id) return;
    setClearingRuns(true);
    try {
      const result = await projectsApi.clearRuns(parseInt(id));
      setClearConfirm(false);
      loadFlows();
      notify(`Cleared ${result.deleted_runs} runs and ${result.deleted_screenshots} screenshots.`);
    } finally { setClearingRuns(false); }
  };

  const handleClearFlows = async () => {
    if (!id) return;
    setClearingFlows(true);
    try {
      const result = await projectsApi.clearFlows(parseInt(id));
      setClearFlowsConfirm(false);
      loadFlows();
      notify(`Deleted ${result.deleted_flows} flows, ${result.deleted_runs} runs, ${result.deleted_screenshots} screenshots.`);
    } finally { setClearingFlows(false); }
  };

  if (!project) {
    return (
      <div style={{ maxWidth: 800 }}>
        {[60, 40, 80, 80].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 10, marginBottom: 12 }} />)}
      </div>
    );
  }

  const anyRunning = flows.some(f => f.runs[0]?.status === 'running' || f.runs[0]?.status === 'pending');

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Back + header */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/projects" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Projects
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 10, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.4px' }}>{project.name}</h1>
            <a className="mono" href={project.base_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', marginTop: 2, display: 'block' }}>
              {project.base_url}
            </a>
          </div>
          <button onClick={() => { setEditingProject(!editingProject); setDeletingProject(false); }} className="btn btn-ghost btn-sm">
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Project settings */}
      {editingProject && (
        <div className="card animate-slide-up" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600 }}>Project Settings</h3>
          <form onSubmit={handleSaveProject}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input className="field" placeholder="Name" value={projectForm.name} onChange={e => setProjectForm({ ...projectForm, name: e.target.value })} required />
              <input className="field" placeholder="Base URL" value={projectForm.base_url} onChange={e => setProjectForm({ ...projectForm, base_url: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <input className="field" placeholder="Description" value={projectForm.description} onChange={e => setProjectForm({ ...projectForm, description: e.target.value })} />
              <select className="field" value={projectForm.schedule} onChange={e => setProjectForm({ ...projectForm, schedule: e.target.value })}>
                {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={savingProject} className="btn btn-primary btn-sm">{savingProject ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setEditingProject(false)} className="btn btn-ghost btn-sm">Cancel</button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Delete project */}
                {!deletingProject ? (
                  <button type="button" onClick={() => setDeletingProject(true)} className="btn btn-sm" style={{ background: 'transparent', color: 'var(--text-subtle)', border: '1px solid transparent', fontSize: 12 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-subtle)'; }}>
                    Delete Project
                  </button>
                ) : (
                  <div className="confirm-dialog animate-slide-up" style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delete "{project.name}" and all its flows?</span>
                    <button type="button" onClick={handleDeleteProject} className="btn btn-danger btn-sm">Delete</button>
                    <button type="button" onClick={() => setDeletingProject(false)} className="btn btn-ghost btn-sm">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Banner */}
      {banner && (
        <div className="animate-slide-up" style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: banner.type === 'ok' ? 'var(--success-bg)' : 'var(--error-bg)',
          border: `1px solid ${banner.type === 'ok' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
          color: banner.type === 'ok' ? 'var(--success)' : 'var(--error)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {banner.msg}
          <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Recording in progress */}
      {recordingSessionId && (
        <div className="card animate-slide-up" style={{ padding: 20, marginBottom: 14, borderColor: 'rgba(248,113,113,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span className="status-dot running" style={{ background: 'var(--error)', boxShadow: '0 0 6px var(--error)' }} />
            <span style={{ fontWeight: 600, color: 'var(--error)', fontSize: 14 }}>Recording in progress</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Browser is open. Navigate your app normally — every action is being captured.
          </p>
          <button onClick={handleStopRecording} className="btn btn-danger btn-sm">⏹ Stop Recording</button>
        </div>
      )}

      {/* Recorded script ready */}
      {recordingScript && !recordingSessionId && (
        <div className="card animate-slide-up" style={{ padding: 20, marginBottom: 14, borderColor: 'rgba(52,211,153,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="status-dot passed" />
            <span style={{ fontWeight: 600, color: 'var(--success)', fontSize: 14 }}>Recording captured</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="field" placeholder="Flow name" value={recordFlowName} onChange={e => setRecordFlowName(e.target.value)} />
            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>Assertions after completion <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>(optional)</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 4 }}>URL contains</div>
                  <input className="field" style={{ fontSize: 12 }} placeholder="/dashboard" value={recordExpectedUrl} onChange={e => setRecordExpectedUrl(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 4 }}>Page shows text</div>
                  <input className="field" style={{ fontSize: 12 }} placeholder="Welcome back" value={recordExpectedText} onChange={e => setRecordExpectedText(e.target.value)} />
                </div>
              </div>
            </div>
            <details style={{ color: 'var(--text-subtle)', fontSize: 12 }}>
              <summary style={{ cursor: 'pointer' }}>View recorded script</summary>
              <pre className="mono" style={{ marginTop: 8, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 140, color: 'var(--text-muted)' }}>{recordingScript}</pre>
            </details>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveRecordedFlow} disabled={savingRecorded || !recordFlowName.trim()} className="btn btn-success btn-sm">{savingRecorded ? 'Saving…' : 'Save Flow'}</button>
              <button onClick={() => { setRecordingScript(''); setRecordExpectedUrl(''); setRecordExpectedText(''); }} className="btn btn-ghost btn-sm">Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* New manual flow form */}
      {showFlowForm && (
        <div className="card animate-slide-up" style={{ padding: 20, marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600 }}>New Manual Flow</h3>
          <form onSubmit={handleCreateFlow}>
            <div style={{ marginBottom: 12 }}>
              <input className="field" placeholder="Flow name" value={newFlowName} onChange={e => setNewFlowName(e.target.value)} required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <FlowBuilder steps={newFlowSteps} onChange={setNewFlowSteps} baseUrl={project.base_url} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving…' : 'Save Flow'}</button>
              <button type="button" onClick={() => setShowFlowForm(false)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Flows toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Test Flows</span>
          <span className="badge badge-neutral mono">{flows.length}</span>
          {anyRunning && <span className="badge badge-running" style={{ fontSize: 10 }}><span className="status-dot running" style={{ width: 5, height: 5 }} />Active</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {flows.length > 0 && (
            <button onClick={handleRunAll} disabled={runningAll} className="btn btn-success btn-sm">
              {runningAll ? 'Starting…' : `▶▶ Run All (${flows.length})`}
            </button>
          )}
          {flows.length > 0 && !clearConfirm && (
            <button onClick={() => setClearConfirm(true)} className="btn btn-ghost btn-sm" style={{ color: 'var(--text-subtle)' }}>
              🧹 Clear History
            </button>
          )}
          {clearConfirm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clear all runs?</span>
              <button onClick={handleClearRuns} disabled={clearingRuns} className="btn btn-warning btn-sm">{clearingRuns ? '…' : 'Clear'}</button>
              <button onClick={() => setClearConfirm(false)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          )}
          {flows.length > 0 && !clearFlowsConfirm && (
            <button onClick={() => setClearFlowsConfirm(true)} className="btn btn-ghost btn-sm" style={{ color: 'var(--text-subtle)' }}>
              🗑 Clear All Flows
            </button>
          )}
          {clearFlowsConfirm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '4px 10px' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delete ALL flows + history?</span>
              <button onClick={handleClearFlows} disabled={clearingFlows} className="btn btn-danger btn-sm">{clearingFlows ? '…' : 'Delete All'}</button>
              <button onClick={() => setClearFlowsConfirm(false)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          )}
          <label className="btn btn-purple btn-sm" style={{ cursor: 'pointer' }}>
            {importing ? 'Importing…' : '📂 Import JSON'}
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} disabled={importing} />
          </label>
          <a href="/api/flows/template" download="flows-template.json" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>⬇ Template</a>
          {!recordingSessionId && !recordingScript && (
            <button onClick={handleStartRecording} className="btn btn-danger btn-sm">🔴 Record</button>
          )}
          <button onClick={() => setShowFlowForm(!showFlowForm)} className="btn btn-ghost btn-sm">+ Manual</button>
        </div>
      </div>

      {/* Flow list */}
      {flows.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.12 }}>▷</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>No flows yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Record a session, import JSON, or build one manually.</div>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {flows.map(flow => {
            const latestRun = flow.runs[0];
            const isActive  = latestRun?.status === 'running' || latestRun?.status === 'pending';
            const rate      = passRate(flow.runs);
            const isEditing = editingFlow === flow.id;

            const statusBorderColor =
              !latestRun ? 'var(--border)' :
              latestRun.status === 'passed'  ? 'var(--success)' :
              latestRun.status === 'failed'  ? 'var(--error)' :
              'var(--running)';

            const thumbFile = latestRun?.live_screenshot;

            return (
              <div key={flow.id} className="card" style={{ borderColor: isActive ? 'rgba(167,139,250,0.2)' : undefined, borderLeft: `3px solid ${statusBorderColor}`, overflow: 'hidden' }}>
                {/* Pass rate bar */}
                {rate && (
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.04)' }}>
                    <div style={{
                      height: '100%',
                      width: `${rate.pct}%`,
                      background: rate.pct === 100 ? 'var(--success)' : rate.pct === 0 ? 'var(--error)' : 'linear-gradient(90deg, var(--error), var(--success))',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                )}
                <div style={{ padding: '14px 16px', display: 'flex', gap: 12 }}>
                  {/* Screenshot thumbnail */}
                  {thumbFile && (
                    <div style={{ flexShrink: 0, width: 80, height: 52, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <img src={`/api/screenshots/${thumbFile}?t=${latestRun?.id}`} alt="last run" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Flow header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={latestRun ? `status-dot ${latestRun.status}` : 'status-dot pending'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link to={`/flows/${flow.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
                        >{flow.name}</div>
                      </Link>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                          {flow.type === 'recorded' ? '⏺ Recorded' : `${flow.steps.length} step${flow.steps.length !== 1 ? 's' : ''}`}
                        </span>
                        {rate && (
                          <span className="mono" style={{ fontSize: 11, color: rate.pct === 100 ? 'var(--success)' : rate.pct === 0 ? 'var(--error)' : 'var(--warning)' }}>
                            {rate.passed}/{rate.total} passing
                          </span>
                        )}
                        {flow.retry_on_failure ? <span style={{ fontSize: 10, color: 'var(--warning)' }}>↺ retry</span> : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {latestRun && <StatusBadge status={latestRun.status} small />}
                      {/* Cancel button when running */}
                      {isActive ? (
                        <button onClick={() => handleCancel(latestRun.id)} disabled={cancelling === latestRun.id} className="btn btn-warning btn-sm" style={{ fontSize: 12 }}>
                          {cancelling === latestRun.id ? '…' : '⏹ Stop'}
                        </button>
                      ) : (
                        <button onClick={() => handleRun(flow.id)} disabled={triggering === flow.id} className="btn btn-success btn-sm" style={{ fontSize: 12 }}>
                          {triggering === flow.id ? '…' : '▶ Run'}
                        </button>
                      )}
                      {flow.type !== 'recorded' && (
                        <IconBtn onClick={() => isEditing ? setEditingFlow(null) : handleStartEdit(flow)} title="Edit steps" hoverColor="var(--accent)">✎</IconBtn>
                      )}
                      <IconBtn onClick={() => handleCloneFlow(flow.id)} title="Clone flow" hoverColor="var(--accent)">
                        {cloning === flow.id ? '…' : '⎘'}
                      </IconBtn>
                      <IconBtn onClick={() => handleToggleRetry(flow)} title={flow.retry_on_failure ? 'Retry: ON — click to disable' : 'Retry: OFF — click to enable'} hoverColor="var(--warning)">
                        <span style={{ color: flow.retry_on_failure ? 'var(--warning)' : undefined }}>↺</span>
                      </IconBtn>
                      <Link to={`/flows/${flow.id}`} title="View details" style={{ textDecoration: 'none' }}>
                        <span style={{ fontSize: 14, color: 'var(--text-subtle)', padding: '4px 6px', cursor: 'pointer', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-subtle)')}
                        >↗</span>
                      </Link>
                      <IconBtn onClick={() => handleDeleteFlow(flow.id)} title="Delete flow" hoverColor="var(--error)">✕</IconBtn>
                    </div>
                  </div>

                  {/* Inline delete confirm */}
                  {deleting === flow.id && (
                    <div className="confirm-dialog animate-slide-up" style={{ marginTop: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>Delete "{flow.name}"?</span>
                      <button onClick={() => confirmDelete(flow.id)} className="btn btn-danger btn-sm">Delete</button>
                      <button onClick={() => setDeleting(null)} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  )}

                  {/* Inline flow editor */}
                  {isEditing && (
                    <div className="animate-slide-up" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      <div style={{ marginBottom: 10 }}>
                        <input className="field" style={{ fontSize: 13 }} placeholder="Flow name" value={editFlowName} onChange={e => setEditFlowName(e.target.value)} />
                      </div>
                      <FlowBuilder steps={editFlowSteps} onChange={setEditFlowSteps} baseUrl={project.base_url} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => handleSaveEdit(flow.id)} disabled={savingEdit} className="btn btn-primary btn-sm">{savingEdit ? 'Saving…' : 'Save Changes'}</button>
                        <button onClick={() => setEditingFlow(null)} className="btn btn-ghost btn-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Live progress */}
                  {isActive && (
                    <div className="live-bar animate-slide-up" style={{ marginTop: 10, borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="status-dot running" />
                      <span style={{ fontSize: 12, color: 'var(--running)' }}>{latestRun.current_step || 'Starting…'}</span>
                    </div>
                  )}
                  {isActive && latestRun.live_screenshot && (
                    <div style={{ marginTop: 8, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(167,139,250,0.15)' }}>
                      <img src={`/api/screenshots/${latestRun.live_screenshot}?t=${Date.now()}`} alt="Live" style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'cover', objectPosition: 'top' }} />
                    </div>
                  )}
                  </div>{/* close flex:1 content wrapper */}
                </div>{/* close padding row */}

                {/* Run history */}
                {flow.runs.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px' }}>
                    {flow.runs.slice(0, 3).map((run, i) => (
                      <Link key={run.id} to={`/runs/${run.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 2 && i < flow.runs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Run #{run.id}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {run.duration_ms && <span className="mono" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{(run.duration_ms / 1000).toFixed(1)}s</span>}
                          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{timeAgo(run.created_at)}</span>
                          <StatusBadge status={run.status} small />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Keyboard hint */}
      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text-subtle)', display: 'flex', gap: 12 }}>
        <span><kbd style={{ background: 'var(--border)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>Esc</kbd> close panels</span>
      </div>
    </div>
  );
}
