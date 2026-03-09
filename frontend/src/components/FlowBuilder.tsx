import { useState } from 'react';

interface Step {
  action: string;
  [key: string]: any;
}

interface Props {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  baseUrl: string;
}

const ACTION_TYPES = [
  { value: 'navigate',       label: 'Navigate',       icon: '→', color: 'var(--accent)' },
  { value: 'click',          label: 'Click',           icon: '↩', color: '#60A5FA' },
  { value: 'fill',           label: 'Fill Input',      icon: '✎', color: '#A78BFA' },
  { value: 'select',         label: 'Select Option',   icon: '☰', color: '#A78BFA' },
  { value: 'wait',           label: 'Wait',            icon: '⏱', color: 'var(--warning)' },
  { value: 'assert_url',     label: 'Assert URL',      icon: '⊕', color: 'var(--success)' },
  { value: 'assert_element', label: 'Assert Element',  icon: '⊕', color: 'var(--success)' },
  { value: 'assert_text',    label: 'Assert Text',     icon: '⊕', color: 'var(--success)' },
  { value: 'screenshot',     label: 'Screenshot',      icon: '⬜', color: '#F472B6' },
];

function ActionIcon({ action }: { action: string }) {
  const a = ACTION_TYPES.find(x => x.value === action);
  return (
    <span style={{ fontSize: 11, color: a?.color || 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', width: 14, textAlign: 'center', flexShrink: 0 }}>
      {a?.icon || '?'}
    </span>
  );
}

function StepFields({ step, onChange }: { step: Step; onChange: (s: Step) => void }) {
  const inputStyle: React.CSSProperties = {
    flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)',
    borderRadius: 5, padding: '5px 9px', color: 'var(--text)', fontSize: 12,
    fontFamily: 'Sora, sans-serif', outline: 'none', minWidth: 0,
  };
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = 'var(--accent)'; };
  const onBlur  = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = 'var(--border)'; };

  switch (step.action) {
    case 'navigate':
      return <input style={inputStyle} placeholder="URL · /login or https://…" value={step.url || ''} onChange={e => onChange({ ...step, url: e.target.value })} onFocus={onFocus} onBlur={onBlur} />;
    case 'click':
    case 'assert_element':
      return <input style={inputStyle} placeholder="CSS selector · #submit or .btn" value={step.selector || ''} onChange={e => onChange({ ...step, selector: e.target.value })} onFocus={onFocus} onBlur={onBlur} />;
    case 'fill':
    case 'select':
      return (
        <>
          <input style={inputStyle} placeholder="CSS selector" value={step.selector || ''} onChange={e => onChange({ ...step, selector: e.target.value })} onFocus={onFocus} onBlur={onBlur} />
          <input style={inputStyle} placeholder="Value" value={step.value || ''} onChange={e => onChange({ ...step, value: e.target.value })} onFocus={onFocus} onBlur={onBlur} />
        </>
      );
    case 'wait':
      return <input type="number" style={inputStyle} placeholder="Milliseconds · 1000" value={step.ms || ''} onChange={e => onChange({ ...step, ms: parseInt(e.target.value) })} onFocus={onFocus} onBlur={onBlur} />;
    case 'assert_url':
      return <input style={inputStyle} placeholder="URL must contain · /dashboard" value={step.contains || ''} onChange={e => onChange({ ...step, contains: e.target.value })} onFocus={onFocus} onBlur={onBlur} />;
    case 'assert_text':
      return (
        <>
          <input style={inputStyle} placeholder="CSS selector · body" value={step.selector || ''} onChange={e => onChange({ ...step, selector: e.target.value })} onFocus={onFocus} onBlur={onBlur} />
          <input style={inputStyle} placeholder="Text must contain" value={step.contains || ''} onChange={e => onChange({ ...step, contains: e.target.value })} onFocus={onFocus} onBlur={onBlur} />
        </>
      );
    case 'screenshot':
      return <input style={inputStyle} placeholder="Screenshot name · after-login" value={step.name || ''} onChange={e => onChange({ ...step, name: e.target.value })} onFocus={onFocus} onBlur={onBlur} />;
    default:
      return null;
  }
}

export default function FlowBuilder({ steps, onChange, baseUrl }: Props) {
  const [selectedAction, setSelectedAction] = useState('navigate');

  const addStep = () => {
    const newStep: Step = { action: selectedAction };
    if (selectedAction === 'navigate') newStep.url = baseUrl;
    onChange([...steps, newStep]);
  };

  const updateStep = (index: number, step: Step) => {
    const updated = [...steps];
    updated[index] = step;
    onChange(updated);
  };

  const removeStep = (index: number) => onChange(steps.filter((_, i) => i !== index));

  const moveStep = (index: number, dir: -1 | 1) => {
    const updated = [...steps];
    const target = index + dir;
    if (target < 0 || target >= updated.length) return;
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onChange(updated);
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
        Steps {steps.length > 0 && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{steps.length}</span>}
      </div>

      {steps.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-subtle)', fontSize: 12, marginBottom: 8 }}>
          No steps yet — add one below
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '7px 10px',
          }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-subtle)', width: 16, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
            <ActionIcon action={step.action} />
            <select
              style={{
                background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)', borderRadius: 5,
                color: 'var(--text)', fontSize: 11, padding: '4px 7px', outline: 'none', flexShrink: 0,
                fontFamily: 'Sora, sans-serif',
              }}
              value={step.action}
              onChange={e => updateStep(i, { ...step, action: e.target.value })}
            >
              {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 5, flex: 1, minWidth: 0 }}>
              <StepFields step={step} onChange={s => updateStep(i, s)} />
            </div>
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              <button onClick={() => moveStep(i, -1)} title="Move up" style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>↑</button>
              <button onClick={() => moveStep(i, 1)}  title="Move down" style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>↓</button>
              <button onClick={() => removeStep(i)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-subtle)')}
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add step row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          className="field"
          style={{ flex: 1, fontSize: 12 }}
          value={selectedAction}
          onChange={e => setSelectedAction(e.target.value)}
        >
          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <button type="button" onClick={addStep} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
          + Add Step
        </button>
      </div>
    </div>
  );
}
