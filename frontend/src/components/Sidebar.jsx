import React from 'react';
import {
  Shield,
  MessageSquare,
  LayoutDashboard,
  Layers,
  BarChart2,
  Clock,
  Cpu,
  Info
} from './Icons.jsx';

export default function Sidebar({ activeTab, setTab, status }) {
  const modelName = status?.ollama?.model || 'llama3.1:8b';

  // Exactly 5 streamlined navigation items, with Live Chat as default priority
  const navItems = [
    { id: 'chat', label: 'Live Chat', icon: MessageSquare },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'attacks', label: 'Attack Library', icon: Layers },
    { id: 'results', label: 'Evaluation Results', icon: BarChart2 },
    { id: 'history', label: 'Query History', icon: Clock },
  ];

  return (
    <aside className="app-sidebar">
      {/* Background ambient wave glow */}
      <div className="sidebar-wave-bg" aria-hidden="true" />

      {/* Brand Header */}
      <div>
        <div className="sidebar-brand">
          <div className="brand-icon-wrapper">
            <Shield size={20} />
          </div>
          <div className="brand-title">
            PromptShield
            <span className="brand-subtitle">AI Security Platform</span>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="sidebar-nav" role="navigation" aria-label="Main Navigation">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTab(item.id);
                  }
                }}
              >
                <IconComponent size={18} />
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer Status Information */}
      <div className="sidebar-footer">
        <div className="footer-status-pill">
          <span className="status-dot-active" />
          <span>Backend: Running</span>
        </div>
        <div className="footer-status-pill">
          <Cpu size={14} color="var(--text-secondary)" />
          <span>Model: {modelName}</span>
        </div>
        <div className="footer-status-pill">
          <Info size={14} color="var(--text-secondary)" />
          <span>v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
