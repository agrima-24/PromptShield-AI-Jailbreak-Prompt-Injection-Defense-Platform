import React from 'react';
import {
  MessageSquare,
  LayoutDashboard,
  Layers,
  BarChart2,
  Clock,
  FileText,
  ShieldCheck,
  Cpu
} from './Icons.jsx';

const TAB_METADATA = {
  chat: {
    title: 'Live Chat',
    subtitle: 'Test prompts against the model with and without PromptShield defense.',
    icon: MessageSquare,
  },
  dashboard: {
    title: 'Dashboard Overview',
    subtitle: 'System security posture, attack metrics and live telemetry.',
    icon: LayoutDashboard,
  },
  attacks: {
    title: 'Attack Library',
    subtitle: 'Explore curated adversarial prompts and indirect injection seeds.',
    icon: Layers,
  },
  results: {
    title: 'Benchmark Reports',
    subtitle: 'Comprehensive benchmark results, ASR/FPR metrics, and judge analysis.',
    icon: BarChart2,
  },
  history: {
    title: 'Query History',
    subtitle: 'Audited log of interactive model queries and defense layer outcomes.',
    icon: Clock,
  },
};

export default function Header({ activeTab, status }) {
  const meta = TAB_METADATA[activeTab] || TAB_METADATA.chat;
  const PageIcon = meta.icon;

  const model = status?.ollama?.model || 'llama3.1:8b';
  const defenseActive = status?.defense?.reachable !== false;
  const attackCount = status?.attacks || 54;
  const cleanDocs = status?.clean_docs || 8;

  return (
    <header className="app-header">
      {/* Page Title & Subtitle */}
      <div className="header-left">
        <div className="header-icon-box">
          <PageIcon size={20} />
        </div>
        <div className="header-title-box">
          <h1>{meta.title}</h1>
          <p>{meta.subtitle}</p>
        </div>
      </div>

      {/* Status Pills */}
      <div className="header-stats-row">
        {/* 1. Ollama */}
        <div className="header-stat-pill">
          <div className="stat-pill-icon">
            <Cpu size={18} color="var(--color-primary)" />
          </div>
          <div className="stat-pill-text">
            <span className="stat-pill-label">Ollama</span>
            <span className="stat-pill-val">{model}</span>
          </div>
        </div>

        {/* 2. Defense */}
        <div className="header-stat-pill">
          <div className="stat-pill-icon">
            <ShieldCheck size={18} color="var(--color-success)" />
          </div>
          <div className="stat-pill-text">
            <span className="stat-pill-label">Defense</span>
            <span className="stat-pill-val" style={{ color: defenseActive ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {defenseActive ? 'Active' : 'Offline'}
            </span>
          </div>
        </div>

        {/* 3. Attack Set */}
        <div className="header-stat-pill">
          <div className="stat-pill-icon">
            <Layers size={18} color="var(--color-primary)" />
          </div>
          <div className="stat-pill-text">
            <span className="stat-pill-label">Attack Set</span>
            <span className="stat-pill-val">{attackCount} attacks</span>
          </div>
        </div>

        {/* 4. Clean Docs */}
        <div className="header-stat-pill">
          <div className="stat-pill-icon">
            <FileText size={18} color="var(--color-primary)" />
          </div>
          <div className="stat-pill-text">
            <span className="stat-pill-label">Clean Docs</span>
            <span className="stat-pill-val">{cleanDocs}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
