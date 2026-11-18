import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import {
  Layers,
  Search,
  Play,
  Info,
  X,
  Target,
  FileText
} from '../components/Icons.jsx';

export default function Attacks({ onOpenInChat }) {
  const [attacks, setAttacks] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedAttack, setSelectedAttack] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.attacks()
      .then((data) => {
        setAttacks(data.attacks || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load attacks:', err);
        setLoading(false);
      });
  }, []);

  const categories = [
    { id: 'all', label: 'All Attacks' },
    { id: 'direct-canary', label: 'Direct Canary' },
    { id: 'direct-harmful', label: 'Direct Harmful' },
    { id: 'indirect', label: 'Indirect Injection' },
  ];

  const filtered = attacks.filter((a) => {
    const matchesSearch = !search ||
      a.id.toLowerCase().includes(search.toLowerCase()) ||
      (a.prompt && a.prompt.toLowerCase().includes(search.toLowerCase())) ||
      (a.style && a.style.toLowerCase().includes(search.toLowerCase())) ||
      (a.group && a.group.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = filterCategory === 'all' ||
      (a.group && a.group.toLowerCase().includes(filterCategory.toLowerCase()));

    return matchesSearch && matchesCategory;
  });

  const getBadgeClass = (group = '') => {
    const g = group.toLowerCase();
    if (g.includes('canary')) return 'badge-cyan';
    if (g.includes('harmful')) return 'badge-purple';
    if (g.includes('indirect')) return 'badge-amber';
    return 'badge-blue';
  };

  return (
    <div className="page-container">
      {/* Header & Search Bar */}
      <div className="ps-card">
        <div className="ps-card-header" style={{ marginBottom: 14 }}>
          <div className="card-title-group">
            <span className="card-title-icon"><Layers size={20} /></span>
            <div>
              <h2>Attack Library & Threat Intelligence</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Frozen benchmark seeds for direct adversarial prompts and indirect poisoned context documents ({attacks.length} total attacks).
              </p>
            </div>
          </div>
        </div>

        {/* Controls Row */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1', minWidth: '260px' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <Search size={16} />
            </span>
            <input
              type="text"
              className="input-custom"
              style={{ paddingLeft: 38 }}
              placeholder="Search by ID, prompt text, keyword, or attack style..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ps-badge ${filterCategory === c.id ? 'badge-cyan' : 'badge-blue'}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  border: filterCategory === c.id ? '1px solid var(--color-primary)' : '1px solid var(--border-card)',
                  background: filterCategory === c.id ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-input)',
                  color: filterCategory === c.id ? '#fff' : 'var(--text-secondary)'
                }}
                onClick={() => setFilterCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Attacks Data Table */}
      <div className="ps-card">
        <div className="ps-table-wrapper">
          <table className="ps-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Attack ID</th>
                <th style={{ width: '130px' }}>Group</th>
                <th>Prompt / Trigger Preview</th>
                <th style={{ width: '120px' }}>Style</th>
                <th style={{ width: '100px' }}>Canary</th>
                <th style={{ width: '110px' }}>Poisoned Doc</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="ps-table-empty">Loading attack library...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ps-table-empty">No attacks match your filter.</td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr
                    key={a.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedAttack(a)}
                  >
                    <td style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                      {a.id}
                    </td>
                    <td>
                      <span className={`ps-badge ${getBadgeClass(a.group)}`}>
                        {a.group}
                      </span>
                    </td>
                    <td style={{ maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.prompt}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {a.style || '—'}
                    </td>
                    <td>
                      {a.has_canary ? (
                        <span className="ps-badge badge-cyan">Yes</span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {a.has_poisoned_doc ? (
                        <span className="ps-badge badge-amber">Attached</span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>None</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="ps-badge badge-blue"
                        style={{ padding: '5px 10px', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenInChat) onOpenInChat(a.id);
                        }}
                      >
                        <Play size={12} color="#fff" style={{ marginRight: 4 }} />
                        Test in Chat
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attack Detail Modal */}
      {selectedAttack && (
        <div className="ps-modal-backdrop" onClick={() => setSelectedAttack(null)}>
          <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--color-primary)' }}><Target size={20} /></span>
                <h3>Attack Details — {selectedAttack.id}</h3>
                <span className={`ps-badge ${getBadgeClass(selectedAttack.group)}`}>
                  {selectedAttack.group}
                </span>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSelectedAttack(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="ps-modal-body">
              <div>
                <label className="form-label">Category & Source</label>
                <div style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                  {selectedAttack.category} • Source: {selectedAttack.source || 'Curated'}
                </div>
              </div>

              <div>
                <label className="form-label">Adversarial Prompt</label>
                <div className="response-textbox" style={{ minHeight: '80px' }}>
                  {selectedAttack.prompt}
                </div>
              </div>

              {selectedAttack.poisoned_doc && (
                <div>
                  <label className="form-label" style={{ color: 'var(--color-warning)' }}>
                    Poisoned Context Document (RAG Ingestion)
                  </label>
                  <div className="response-textbox" style={{ minHeight: '100px', borderColor: 'var(--color-warning-border)' }}>
                    {selectedAttack.poisoned_doc}
                  </div>
                </div>
              )}
            </div>

            <div className="ps-modal-footer">
              <button
                type="button"
                className="btn-run-both"
                style={{ width: 'auto', padding: '10px 18px' }}
                onClick={() => {
                  const id = selectedAttack.id;
                  setSelectedAttack(null);
                  if (onOpenInChat) onOpenInChat(id);
                }}
              >
                <Play size={14} color="#fff" />
                Open & Test in Live Chat
              </button>
              <button
                type="button"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)', padding: '10px 18px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                onClick={() => setSelectedAttack(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
