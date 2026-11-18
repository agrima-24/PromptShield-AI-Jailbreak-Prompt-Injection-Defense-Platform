import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  BarChart2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Search,
  ChevronDown,
  Info,
  Layers,
  FileText
} from '../components/Icons.jsx';

const pct = (v) => {
  if (v == null || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
};

const interval = (c) => {
  if (!c || !Array.isArray(c) || c.length < 2) return '—';
  return `${Number(c[0]).toFixed(1)}% – ${Number(c[1]).toFixed(1)}%`;
};

const ms = (v) => {
  if (v == null || isNaN(v)) return '—';
  return `${Math.round(v)} ms`;
};

const CONFIG_DISPLAY_NAMES = {
  naive: 'Naive (No Defense)',
  hardened: 'Hardened Prompt Only',
  segregator: 'Segregator Only',
  classifier: 'Classifier Only',
  perplexity: 'Perplexity Only',
  all: 'All Layers (Full Defense)',
};

const GROUP_DISPLAY_NAMES = {
  'direct-canary': 'Direct: Canary Leak',
  'direct-harmful': 'Direct: Harmful Jailbreak',
  'indirect-matched': 'Indirect: Matched Trigger',
  'indirect-dev': 'Indirect: Dev Benchmark',
  'indirect-heldout': 'Indirect: Held-Out Test',
  direct: 'Direct (Generic)',
  indirect: 'Indirect (Generic)',
};

function DynamicAsrFprChart({ configs, data }) {
  if (!configs || configs.length === 0) return null;

  const chartHeight = 240;
  const chartWidth = Math.max(600, configs.length * 130);
  const padLeft = 55;
  const padBottom = 45;
  const padTop = 30;
  const padRight = 30;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;
  const groupWidth = innerW / configs.length;
  const barWidth = Math.min(28, (groupWidth - 24) / 2);

  return (
    <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', fontSize: '13px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 14, height: 14, background: 'var(--color-primary)', borderRadius: 3 }} />
          <strong style={{ color: 'var(--text-primary)' }}>ASR</strong> (Attack Success Rate — Lower is safer)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 14, height: 14, background: 'var(--color-warning)', borderRadius: 3 }} />
          <strong style={{ color: 'var(--text-primary)' }}>FPR</strong> (Benign False Positive Rate — Lower is better)
        </span>
      </div>

      <svg width={chartWidth} height={chartHeight} style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)' }}>
        {/* Y Axis Grid lines */}
        {[0, 25, 50, 75, 100].map((v) => {
          const y = padTop + innerH - (v / 100) * innerH;
          return (
            <g key={v}>
              <line x1={padLeft} y1={y} x2={padLeft + innerW} y2={y} stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <text x={padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                {v}%
              </text>
            </g>
          );
        })}

        {/* Configuration Bars */}
        {configs.map((c, i) => {
          const r = data.configs[c];
          if (!r) return null;
          const gx = padLeft + i * groupWidth + (groupWidth - barWidth * 2 - 6) / 2;

          const asrVal = Math.max(0, Math.min(100, r.asr_strict || 0));
          const asrH = (asrVal / 100) * innerH;
          const asrY = padTop + innerH - asrH;

          const fpVal = Math.max(0, Math.min(100, r.fpr || 0));
          const fpH = (fpVal / 100) * innerH;
          const fpY = padTop + innerH - fpH;

          return (
            <g key={c}>
              {/* ASR Bar */}
              <rect x={gx} y={asrY} width={barWidth} height={asrH} fill="var(--color-primary)" rx="3">
                <title>{`ASR: ${pct(r.asr_strict)}`}</title>
              </rect>
              {asrVal > 0 && (
                <text x={gx + barWidth / 2} y={asrY - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-primary)">
                  {pct(r.asr_strict)}
                </text>
              )}

              {/* FPR Bar */}
              <rect x={gx + barWidth + 6} y={fpY} width={barWidth} height={fpH} fill="var(--color-warning)" rx="3">
                <title>{`FPR: ${pct(r.fpr)}`}</title>
              </rect>
              {fpVal > 0 && (
                <text x={gx + barWidth * 1.5 + 6} y={fpY - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-warning)">
                  {pct(r.fpr)}
                </text>
              )}

              {/* Label */}
              <text x={gx + barWidth + 3} y={padTop + innerH + 20} textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--text-secondary)">
                {CONFIG_DISPLAY_NAMES[c] || c}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Results() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transcripts, setTranscripts] = useState(null);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [configFilter, setConfigFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // Load available result files on mount
  useEffect(() => {
    api.results()
      .then((items) => {
        setFiles(items || []);
        if (items && items.length > 0) {
          setSelectedFile(items[0].name);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load result files:', err);
        setLoading(false);
      });
  }, []);

  // Fetch file data whenever selectedFile changes
  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    setTranscripts(null);
    setExpandedId(null);

    api.result(selectedFile)
      .then((res) => {
        setData(res);
        setLoading(false);

        // If file has associated transcripts, load them
        if (res.run_id) {
          setTranscriptsLoading(true);
          api.transcripts(res.run_id)
            .then((t) => {
              setTranscripts(t);
              setTranscriptsLoading(false);
            })
            .catch(() => {
              setTranscripts(null);
              setTranscriptsLoading(false);
            });
        }
      })
      .catch((err) => {
        console.error('Failed to load result data:', err);
        setData(null);
        setLoading(false);
      });
  }, [selectedFile]);

  // Handle empty state if no result files exist
  if (!loading && files.length === 0) {
    return (
      <div className="page-container">
        <div className="ps-card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ color: 'var(--color-primary)', marginBottom: 16 }}>
            <BarChart2 size={48} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
            No Benchmark Results Found
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 20px auto', fontSize: '0.9rem' }}>
            There are currently no evaluation result files in the <code>results/</code> directory. Run the evaluation benchmark to generate real metrics:
          </p>
          <div style={{ background: 'var(--bg-input)', padding: '12px 18px', borderRadius: 'var(--radius-md)', display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: '0.88rem', border: '1px solid var(--border-card)' }}>
            python evaluation/runner.py
          </div>
        </div>
      </div>
    );
  }

  const configs = data?.configs ? Object.keys(data.configs) : [];

  // Collect all unique attack groups across all configs in the data
  const allGroups = [];
  if (data?.groups) {
    Object.values(data.groups).forEach((cfgGroup) => {
      Object.keys(cfgGroup || {}).forEach((g) => {
        if (!allGroups.includes(g)) allGroups.push(g);
      });
    });
  }

  // Derive dynamic top KPI metrics from the actual selected file
  const naiveConfig = data?.configs?.naive;
  // Pick the primary defended config (prefer 'all', otherwise the first non-naive config)
  const defendedConfigKey = configs.includes('all') ? 'all' : configs.find((c) => c !== 'naive') || configs[0];
  const defendedConfig = defendedConfigKey ? data?.configs?.[defendedConfigKey] : null;

  // Filtered transcripts
  const filteredTranscripts = (transcripts || []).filter((t) => {
    const matchesConfig = configFilter === 'all' || t.config === configFilter;
    if (!matchesConfig) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (t.prompt && t.prompt.toLowerCase().includes(s)) ||
      (t.response && t.response.toLowerCase().includes(s)) ||
      (t.id && t.id.toLowerCase().includes(s)) ||
      (t.judge_reasoning && t.judge_reasoning.toLowerCase().includes(s))
    );
  });

  return (
    <div className="page-container">
      {/* Run Selector & Meta Card */}
      <div className="ps-card">
        <div className="ps-card-header">
          <div className="card-title-group">
            <span className="card-title-icon"><BarChart2 size={20} /></span>
            <div>
              <h2>Benchmark Reports & Evaluation Metrics</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Dynamically connected to benchmark artifacts in <code>results/</code>. Currently analyzing: <strong>{selectedFile}</strong>
              </p>
            </div>
          </div>

          {/* Result File Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Artifact File:</label>
            <select
              className="select-custom"
              style={{ width: 'auto', minWidth: '260px' }}
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
            >
              {files.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.kind === 'adaptive' ? 'Adaptive' : 'Static Run'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Summary Cards based on Actual Data */}
        {data && data.configs && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>
            {/* 1. Naive Baseline ASR */}
            <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '16px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Naive Baseline ASR
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--color-danger)', marginTop: 4 }}>
                {naiveConfig ? pct(naiveConfig.asr_strict) : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {naiveConfig ? `${naiveConfig.n_attacks} attacks tested` : 'No naive baseline in run'}
              </div>
            </div>

            {/* 2. Defended ASR */}
            <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '16px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Defended ASR ({CONFIG_DISPLAY_NAMES[defendedConfigKey] || defendedConfigKey || 'Defended'})
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--color-success)', marginTop: 4 }}>
                {defendedConfig ? pct(defendedConfig.asr_strict) : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {defendedConfig ? `CI: ${interval(defendedConfig.asr_strict_ci)}` : '—'}
              </div>
            </div>

            {/* 3. False Positive Rate */}
            <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '16px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Benign False Positive Rate (FPR)
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--color-warning)', marginTop: 4 }}>
                {defendedConfig ? pct(defendedConfig.fpr) : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {defendedConfig ? `CI: ${interval(defendedConfig.fpr_ci)}` : '—'}
              </div>
            </div>

            {/* 4. Defense Latency */}
            <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '16px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Defense Latency (Median / P95)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 6 }}>
                {defendedConfig?.defense_rt_median != null ? `${ms(defendedConfig.defense_rt_median)} / ${ms(defendedConfig.defense_rt_p95)}` : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Round trip gate timing
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Dynamic Chart & Config Table */}
      {data && (
        <div className="ps-card">
          <div className="ps-card-header">
            <div className="card-title-group">
              <span className="card-title-icon"><BarChart2 size={20} /></span>
              <h2>Attack Success Rate vs. Benign False Positive Rate by Configuration</h2>
            </div>
          </div>

          <DynamicAsrFprChart configs={configs} data={data} />

          <div className="ps-table-wrapper">
            <table className="ps-table">
              <thead>
                <tr>
                  <th>Configuration</th>
                  <th>Attack Success Rate (ASR)</th>
                  <th>95% Wilson Interval</th>
                  <th>Benign Blocked (FPR)</th>
                  <th>95% Wilson Interval</th>
                  <th>Defense Round Trip (Median / P95)</th>
                  <th>Untested</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => {
                  const r = data.configs[c];
                  if (!r) return null;
                  const asrHigh = (r.asr_strict || 0) > 20;
                  const fprHigh = (r.fpr || 0) > 5;

                  return (
                    <tr key={c}>
                      <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                        {CONFIG_DISPLAY_NAMES[c] || c}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: asrHigh ? 'var(--color-danger)' : 'var(--color-success)' }}>
                          {pct(r.asr_strict)}
                        </span>{' '}
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>({r.n_attacks || 0} tested)</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {interval(r.asr_strict_ci)}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: fprHigh ? 'var(--color-warning)' : 'var(--color-success)' }}>
                          {pct(r.fpr)}
                        </span>{' '}
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>({r.n_benign || 0} tested)</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {interval(r.fpr_ci)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {r.defense_rt_median == null ? '—' : `${ms(r.defense_rt_median)} / ${ms(r.defense_rt_p95)}`}
                      </td>
                      <td style={{ color: 'var(--text-dim)' }}>
                        {r.n_untested || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Group Breakdown Table */}
      {data && allGroups.length > 0 && (
        <div className="ps-card">
          <div className="ps-card-header">
            <div className="card-title-group">
              <span className="card-title-icon"><ShieldCheck size={20} /></span>
              <h2>Attack Group Success Breakdown (Complied / Tested)</h2>
            </div>
          </div>

          <div className="ps-table-wrapper">
            <table className="ps-table">
              <thead>
                <tr>
                  <th>Configuration</th>
                  {allGroups.map((g) => (
                    <th key={g}>{GROUP_DISPLAY_NAMES[g] || g}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c}>
                    <td style={{ fontWeight: 600 }}>{CONFIG_DISPLAY_NAMES[c] || c}</td>
                    {allGroups.map((g) => {
                      const cell = data.groups?.[c]?.[g];
                      const val = cell ? `${cell.complied} / ${cell.tested}` : '—';
                      const isHigh = cell && cell.complied > 0;
                      return (
                        <td key={g}>
                          <span style={{ color: isHigh ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                            {val}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dynamic Transcripts & Judge Reasoning */}
      {data && (
        <div className="ps-card">
          <div className="ps-card-header">
            <div className="card-title-group">
              <span className="card-title-icon"><Clock size={20} /></span>
              <div>
                <h2>Transcripts & LLM Judge Reasoning ({filteredTranscripts.length} records)</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Audit individual prompt submissions, model responses, and automated judge verdicts for run {data.run_id}.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Config Filter */}
              <select
                className="select-custom"
                style={{ width: 'auto', fontSize: '0.82rem' }}
                value={configFilter}
                onChange={(e) => setConfigFilter(e.target.value)}
              >
                <option value="all">All Configurations</option>
                {configs.map((c) => (
                  <option key={c} value={c}>{CONFIG_DISPLAY_NAMES[c] || c}</option>
                ))}
              </select>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '240px' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  className="input-custom"
                  style={{ paddingLeft: 34, fontSize: '0.82rem' }}
                  placeholder="Search prompts/responses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {transcriptsLoading ? (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
              Loading transcript records...
            </div>
          ) : filteredTranscripts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
              {transcripts === null ? 'No transcript file found for this evaluation run.' : 'No transcripts match your filter.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredTranscripts.map((t, idx) => {
                const isExpanded = expandedId === idx;
                const isComplied = t.verdict === 'complied';

                return (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'var(--bg-card-sub)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                      onClick={() => setExpandedId(isExpanded ? null : idx)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="ps-badge badge-blue">{t.id || `Item #${idx + 1}`}</span>
                        <span className="ps-badge badge-cyan">{t.config}</span>
                        <span style={{ fontWeight: 500, fontSize: '0.85rem', maxWidth: '440px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.prompt}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className={`ps-badge ${isComplied ? 'badge-red' : 'badge-green'}`}>
                          {t.verdict || 'unknown'}
                        </span>
                        <ChevronDown size={16} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-input)' }}>
                        <div>
                          <strong style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>PROMPT:</strong>
                          <div style={{ fontSize: '0.86rem', marginTop: 4, lineHeight: 1.5 }}>{t.prompt}</div>
                        </div>

                        <div>
                          <strong style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>MODEL RESPONSE:</strong>
                          <div className="response-textbox" style={{ marginTop: 4, minHeight: '80px', maxHeight: '240px' }}>
                            {t.response || '—'}
                          </div>
                        </div>

                        {t.judge_reasoning && (
                          <div>
                            <strong style={{ fontSize: '0.78rem', color: 'var(--color-primary)' }}>JUDGE REASONING:</strong>
                            <div style={{ fontSize: '0.84rem', marginTop: 4, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {t.judge_reasoning}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
