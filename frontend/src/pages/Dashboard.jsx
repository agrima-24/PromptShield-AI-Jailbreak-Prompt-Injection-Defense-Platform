import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  ShieldCheck,
  Target,
  BarChart2,
  Clock,
  Layers,
  Cpu,
  ArrowRight,
  FileText
} from '../components/Icons.jsx';

export default function Dashboard({ onNavigate }) {
  const [status, setStatus] = useState(null);
  const [historyData, setHistoryData] = useState({ total: 0, history: [] });

  useEffect(() => {
    api.status().then(setStatus).catch(console.error);
    api.history({ limit: 10 }).then(setHistoryData).catch(console.error);
  }, []);

  const totalAttacks = status?.attacks || 54;
  const totalQueries = historyData.total || 0;
  const cleanDocs = status?.clean_docs || 8;

  // Compute metrics from history
  const blockedCount = historyData.history.filter((q) => q.verdict_with === 'blocked').length;
  const blockRate = historyData.history.length > 0 
    ? Math.round((blockedCount / historyData.history.length) * 100) 
    : 100;

  return (
    <div className="page-container">
      {/* Welcome Banner */}
      <div className="ps-card" style={{ background: 'linear-gradient(135deg, rgba(12,21,39,0.9), rgba(16,28,52,0.95))', border: '1px solid var(--border-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span className="ps-badge badge-cyan">Cyber Threat Intelligence</span>
              <span className="ps-badge badge-green">Pipeline Operational</span>
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              PromptShield Enterprise Threat Console
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '720px' }}>
              Real-time multi-layered defense against direct jailbreaks, indirect document injections, and adversarial prompt attacks using fine-tuned DistilBERT, perplexity filtering, and retrieved-content segregation.
            </p>
          </div>
          <button
            type="button"
            className="btn-run-both"
            style={{ width: 'auto', padding: '10px 20px' }}
            onClick={() => onNavigate && onNavigate('chat')}
          >
            Open Live Security Console <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {/* Card 1: Total Attacks */}
        <div className="ps-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Available Attacks
            </span>
            <span style={{ color: 'var(--color-primary)' }}><Target size={18} /></span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalAttacks}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Dataset version v{status?.attack_set || '168c834db898'}
          </div>
        </div>

        {/* Card 2: Total Queries Executed */}
        <div className="ps-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Audited Queries
            </span>
            <span style={{ color: 'var(--color-secondary)' }}><Clock size={18} /></span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalQueries}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Persistent in SQLite database
          </div>
        </div>

        {/* Card 3: Defense Block Rate */}
        <div className="ps-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Attack Block Rate
            </span>
            <span style={{ color: 'var(--color-success)' }}><ShieldCheck size={18} /></span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-success)' }}>
            {blockRate}%
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {blockedCount} blocked in audit history
          </div>
        </div>

        {/* Card 4: Knowledge Base Docs */}
        <div className="ps-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Clean Knowledge Docs
            </span>
            <span style={{ color: 'var(--color-primary)' }}><FileText size={18} /></span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {cleanDocs}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Chroma vector collection
          </div>
        </div>

        {/* Card 5: Model Status */}
        <div className="ps-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Target Model
            </span>
            <span style={{ color: 'var(--color-info)' }}><Cpu size={18} /></span>
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            {status?.ollama?.model || 'llama3.1:8b'}
          </div>
          <div style={{ fontSize: '0.76rem', color: status?.ollama?.reachable ? 'var(--color-success)' : 'var(--color-danger)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="status-dot-active" style={{ background: status?.ollama?.reachable ? 'var(--color-success)' : 'var(--color-danger)' }} />
            {status?.ollama?.reachable ? 'Connected & Pulled' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Two Column Section: Multi-Layer Telemetry & Attack Categories */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Defense Layer Health */}
        <div className="ps-card">
          <div className="ps-card-header">
            <div className="card-title-group">
              <span className="card-title-icon"><ShieldCheck size={20} /></span>
              <h2>Multi-Layer Defense Pipeline</h2>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--bg-card-sub)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>Layer 1: Classifier (DistilBERT)</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Direct adversarial prompt detection & learned jailbreak patterns</div>
              </div>
              <span className="ps-badge badge-green">Active (0.50 cutoff)</span>
            </div>

            <div style={{ background: 'var(--bg-card-sub)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>Layer 2: Perplexity (GPT-2 Anomaly)</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Statistical perplexity ceiling against base64/leetspeak obfuscation</div>
              </div>
              <span className="ps-badge badge-green">Active (1287.1 cutoff)</span>
            </div>

            <div style={{ background: 'var(--bg-card-sub)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>Layer 3: Segregator (Content Boundary)</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Retrieval context regex isolation against indirect injection</div>
              </div>
              <span className="ps-badge badge-green">Active (1.0 cutoff)</span>
            </div>
          </div>
        </div>

        {/* Attack Category Distribution */}
        <div className="ps-card">
          <div className="ps-card-header">
            <div className="card-title-group">
              <span className="card-title-icon"><Layers size={20} /></span>
              <h2>Attack Dataset Composition</h2>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                <span>Direct Canary Leaks</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>14 attacks</span>
              </div>
              <div style={{ background: 'var(--bg-input)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-primary)', width: '26%', height: '100%' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                <span>Direct Harmful Jailbreaks</span>
                <span style={{ color: 'var(--color-purple)', fontWeight: 600 }}>10 attacks</span>
              </div>
              <div style={{ background: 'var(--bg-input)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-purple)', width: '18%', height: '100%' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                <span>Indirect Poisoned Retrievable Docs</span>
                <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>20 attacks</span>
              </div>
              <div style={{ background: 'var(--bg-input)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-warning)', width: '37%', height: '100%' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                <span>Indirect Held-Out Evaluation</span>
                <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>10 attacks</span>
              </div>
              <div style={{ background: 'var(--bg-input)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-secondary)', width: '19%', height: '100%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
