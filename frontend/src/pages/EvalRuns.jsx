import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  FileText,
  BarChart2,
  Trash2,
  X,
  ArrowRight,
  ShieldCheck,
  Clock
} from '../components/Icons.jsx';

export default function EvalRuns({ onNavigateToResults }) {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);

  // Compare mode
  const [compareRunA, setCompareRunA] = useState('');
  const [compareRunB, setCompareRunB] = useState('');

  const loadRuns = () => {
    setLoading(true);
    api.runs()
      .then((data) => {
        const list = data.runs || [];
        setRuns(list);
        if (list.length >= 2) {
          setCompareRunA(list[0].run_id);
          setCompareRunB(list[1].run_id);
        } else if (list.length === 1) {
          setCompareRunA(list[0].run_id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete evaluation run record #${id}?`)) return;
    try {
      await api.deleteRun(id);
      loadRuns();
      if (selectedRun?.id === id) setSelectedRun(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return ts;
    }
  };

  const pct = (val) => {
    if (val == null) return '—';
    return (val * 100).toFixed(1) + '%';
  };

  const runA = runs.find((r) => r.run_id === compareRunA);
  const runB = runs.find((r) => r.run_id === compareRunB);

  return (
    <div className="page-container">
      {/* Header Card */}
      <div className="ps-card">
        <div className="ps-card-header">
          <div className="card-title-group">
            <span className="card-title-icon"><FileText size={20} /></span>
            <div>
              <h2>Evaluation Run History & Multi-Run Telemetry</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Persistent benchmark experiments, model evaluations, and cross-run comparative analysis.
              </p>
            </div>
          </div>
        </div>

        {/* Compare Runs Section */}
        {runs.length >= 2 && (
          <div style={{ background: 'var(--bg-card-sub)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={18} color="var(--color-primary)" />
                <strong style={{ fontSize: '0.92rem' }}>Cross-Run Performance Comparison</strong>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <select
                  className="select-custom"
                  style={{ width: 'auto' }}
                  value={compareRunA}
                  onChange={(e) => setCompareRunA(e.target.value)}
                >
                  {runs.map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      Run A: {r.run_id}
                    </option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-muted)' }}>vs</span>
                <select
                  className="select-custom"
                  style={{ width: 'auto' }}
                  value={compareRunB}
                  onChange={(e) => setCompareRunB(e.target.value)}
                >
                  {runs.map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      Run B: {r.run_id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {runA && runB && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Strict ASR Delta</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {pct(runA.asr_strict)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {pct(runB.asr_strict)}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Benign FPR Delta</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {pct(runA.fpr)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                      {pct(runB.fpr)}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Median Latency Delta</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {Math.round(runA.latency_median || 0)} ms
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
                      {Math.round(runB.latency_median || 0)} ms
                    </span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>P95 Latency Delta</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {Math.round(runA.latency_p95 || 0)} ms
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
                      {Math.round(runB.latency_p95 || 0)} ms
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Runs Table */}
      <div className="ps-card">
        <div className="ps-table-wrapper">
          <table className="ps-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Timestamp</th>
                <th>Model</th>
                <th>Config</th>
                <th>Attacks</th>
                <th>ASR (Strict)</th>
                <th>Benign FPR</th>
                <th>p50 Latency</th>
                <th>p95 Latency</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="ps-table-empty">Loading evaluation runs...</td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="ps-table-empty">
                    No evaluation runs logged yet. Execute <code>python evaluation/runner.py</code> to record benchmark runs.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr
                    key={r.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedRun(r)}
                  >
                    <td style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                      {r.run_id}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatTime(r.timestamp)}
                    </td>
                    <td>{r.model || 'llama3.1:8b'}</td>
                    <td>
                      <span className="ps-badge badge-blue">{r.config || 'all'}</span>
                    </td>
                    <td>{r.total_attacks ?? 54}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: (r.asr_strict || 0) > 0.1 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {pct(r.asr_strict)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: (r.fpr || 0) > 0.05 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                        {pct(r.fpr)}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(r.latency_median || 0)} ms</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(r.latency_p95 || 0)} ms</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          type="button"
                          className="ps-badge badge-blue"
                          style={{ cursor: 'pointer', padding: '4px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRun(r);
                          }}
                        >
                          Detail
                        </button>
                        <button
                          type="button"
                          className="ps-badge badge-red"
                          style={{ cursor: 'pointer', padding: '4px 8px' }}
                          onClick={(e) => handleDelete(r.id, e)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Run Detail Modal */}
      {selectedRun && (
        <div className="ps-modal-backdrop" onClick={() => setSelectedRun(null)}>
          <div className="ps-modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--color-primary)' }}><FileText size={20} /></span>
                <h3>Run Benchmark Metadata — {selectedRun.run_id}</h3>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSelectedRun(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="ps-modal-body">
              <table className="ps-table">
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--text-muted)', width: '160px' }}>Run ID</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{selectedRun.run_id}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Timestamp</td>
                    <td>{formatTime(selectedRun.timestamp)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Dataset Version</td>
                    <td>v{selectedRun.dataset_version || '168c834db898'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Model</td>
                    <td>{selectedRun.model || 'llama3.1:8b'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Defense Config</td>
                    <td>{selectedRun.config || 'all'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Strict ASR</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-danger)' }}>{pct(selectedRun.asr_strict)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>False Positive Rate</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-warning)' }}>{pct(selectedRun.fpr)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Latency (p50 / p95)</td>
                    <td>{Math.round(selectedRun.latency_median || 0)} ms / {Math.round(selectedRun.latency_p95 || 0)} ms</td>
                  </tr>
                  {selectedRun.csv_path && (
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>CSV Artifact</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{selectedRun.csv_path}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="ps-modal-footer">
              {onNavigateToResults && (
                <button
                  type="button"
                  className="btn-run-both"
                  style={{ width: 'auto', padding: '10px 18px' }}
                  onClick={() => {
                    setSelectedRun(null);
                    onNavigateToResults();
                  }}
                >
                  View Full Evaluation Analysis <ArrowRight size={14} />
                </button>
              )}
              <button
                type="button"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)', padding: '10px 18px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                onClick={() => setSelectedRun(null)}
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
