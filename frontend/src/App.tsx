import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import RunDetailPage from './pages/RunDetailPage';
import FlowDetailPage from './pages/FlowDetailPage';

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function App() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 220,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        zIndex: 20,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30,
              background: 'var(--accent-glow)',
              border: '1px solid var(--border-active)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>maiflow</div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 1 }}>test automation</div>
            </div>
          </div>
        </div>

        <div style={{ margin: '0 12px 8px', height: 1, background: 'var(--border)' }} />

        {/* Navigation */}
        <nav style={{ padding: '8px 12px', flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, padding: '0 10px' }}>
            Menu
          </div>
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            Dashboard
          </NavLink>
          <NavLink to="/projects" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <NavIcon d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            Projects
          </NavLink>
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>local · v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* ── Content ── */}
      <main style={{ flex: 1, marginLeft: 220, padding: '32px 36px', minHeight: '100vh', maxWidth: 'calc(100vw - 220px)' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/flows/:id" element={<FlowDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
