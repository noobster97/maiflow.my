interface Props {
  status: 'pending' | 'running' | 'passed' | 'failed';
  small?: boolean;
}

const config = {
  pending: { label: 'Pending', cls: 'badge-neutral' },
  running: { label: 'Running', cls: 'badge-running' },
  passed:  { label: 'Passed',  cls: 'badge-success' },
  failed:  { label: 'Failed',  cls: 'badge-error' },
};

export default function StatusBadge({ status, small }: Props) {
  const c = config[status];
  return (
    <span className={`badge ${c.cls}`} style={small ? { fontSize: 10, padding: '2px 7px' } : {}}>
      <span className={`status-dot ${status}`} style={small ? { width: 5, height: 5 } : {}} />
      {c.label}
    </span>
  );
}
