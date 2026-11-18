import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import {
  Target,
  BarChart2,
  Clock,
  Play,
  Info,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Copy
} from '../components/Icons.jsx';

export default function LiveChat({ preset, onPresetUsed }) {
  const [attacks, setAttacks] = useState([]);
  const [selectedAttackId, setSelectedAttackId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [config, setConfig] = useState('all');
  const [promptMode, setPromptMode] = useState('hardened');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copiedLeft, setCopiedLeft] = useState(false);
  const [copiedRight, setCopiedRight] = useState(false);

  // Fetch attacks on load
  useEffect(() => {
    api.attacks()
      .then((data) => {
        const list = data.attacks || [];
        setAttacks(list);
        
        // Handle preset if provided
        if (preset) {
          const matched = list.find((a) => a.id === preset);
          if (matched) {
            setSelectedAttackId(matched.id);
            setPrompt(matched.prompt || '');
          }
          if (onPresetUsed) onPresetUsed();
        } else if (list.length > 0 && !prompt) {
          // Pre-select DC09 as seen in reference image
          const defaultAttack = list.find((a) => a.id === 'DC09') || list[0];
          setSelectedAttackId(defaultAttack.id);
          setPrompt(defaultAttack.prompt || '');
        }
      })
      .catch((err) => console.error('Failed to load attacks:', err));
  }, [preset]);

  // When attack selection changes
  const handleAttackChange = (e) => {
    const id = e.target.value;
    setSelectedAttackId(id);
    if (!id) return;
    const a = attacks.find((item) => item.id === id);
    if (a) {
      setPrompt(a.prompt || '');
    }
  };

  const selectedAttack = attacks.find((a) => a.id === selectedAttackId);

  // Execute query against real backend
  const handleRun = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.chat({
        query: prompt,
        config,
        prompt_mode: promptMode,
        attack_id: selectedAttackId || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Execution failed');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, isLeft) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (isLeft) {
      setCopiedLeft(true);
      setTimeout(() => setCopiedLeft(false), 2000);
    } else {
      setCopiedRight(true);
      setTimeout(() => setCopiedRight(false), 2000);
    }
  };

  const formatSeconds = (ms) => {
    if (ms == null) return '—';
    return (ms / 1000).toFixed(2) + ' s';
  };

  // Selected or active query data
  const withoutDefense = result?.without_defense;
  const withDefense = result?.with_defense;
  const totalDuration = withoutDefense && withDefense
    ? ((withoutDefense.total_ms || 0) + (withDefense.total_ms || 0))
    : null;

  // Active attack badges
  const getCategoryBadgeClass = (category = '') => {
    const cat = category.toLowerCase();
    if (cat.includes('canary')) return 'badge-cyan';
    if (cat.includes('harmful')) return 'badge-purple';
    if (cat.includes('matched') || cat.includes('indirect')) return 'badge-amber';
    return 'badge-blue';
  };

  return (
    <div className="page-container" style={{ paddingBottom: '32px' }}>
      {/* Upper Expanded Section: Attack Configuration & Results Comparison */}
      <div className="livechat-grid">
        {/* Left Card: Attack Configuration */}
        <div className="ps-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ps-card-header">
            <div className="card-title-group">
              <span className="card-title-icon">
                <Target size={20} />
              </span>
              <h2>Attack Configuration</h2>
            </div>
            {prompt && (
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                {prompt.length} chars • {prompt.trim().split(/\s+/).length} words
              </span>
            )}
          </div>

          {/* Attack Dropdown */}
          <div className="form-group">
            <label className="form-label" htmlFor="attack-select">Attack (optional)</label>
            <select
              id="attack-select"
              className="select-custom"
              value={selectedAttackId}
              onChange={handleAttackChange}
            >
              <option value="">Custom query (no preset attack)</option>
              {attacks.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.group} — {a.style || a.category}
                </option>
              ))}
            </select>
          </div>

          {/* Attack Badges */}
          {selectedAttack && (
            <div className="attack-badges-row">
              <span className={`ps-badge ${getCategoryBadgeClass(selectedAttack.group)}`}>
                {selectedAttack.attack_type === 'direct' ? 'Direct: ' : 'Indirect: '}
                {selectedAttack.variant || (selectedAttack.canary ? 'Canary' : 'Harmful')}
              </span>
              {selectedAttack.canary && (
                <span className="ps-badge badge-blue">
                  Canary Attack
                </span>
              )}
              {selectedAttack.has_poisoned_doc && (
                <span className="ps-badge badge-amber">
                  Poisoned Doc Attached
                </span>
              )}
            </div>
          )}

          {/* Guidance Info Box */}
          <div className="ps-info-box">
            <span className="ps-info-icon">
              <Info size={16} />
            </span>
            <div>
              {selectedAttack?.attack_type === 'indirect'
                ? 'Indirect injection attack: attaching an adversarial document into the retrieval store for this query only.'
                : 'Direct attack. The left side is an unprotected model, so it may produce harmful text. Use this for a controlled demo only.'}
            </div>
          </div>

          {/* Generously Sized Prompt Textarea */}
          <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label className="form-label" htmlFor="prompt-input">Prompt</label>
            <textarea
              id="prompt-input"
              className="textarea-custom"
              rows={12}
              style={{ minHeight: '270px', flex: 1 }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your adversarial prompt, jailbreak query, or testing instruction..."
            />
          </div>

          {/* Configuration Selectors */}
          <div className="form-row-2col">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Defense Configuration</label>
              <select
                className="select-custom"
                value={config}
                onChange={(e) => setConfig(e.target.value)}
              >
                <option value="all">All layers: classifier + ...</option>
                <option value="classifier">Classifier only</option>
                <option value="perplexity">Perplexity only</option>
                <option value="segregator">Segregator only</option>
                <option value="hardened">Prompt hardening only</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Prompt Strategy</label>
              <select
                className="select-custom"
                value={promptMode}
                onChange={(e) => setPromptMode(e.target.value)}
              >
                <option value="hardened">Hardened (retrieved text)</option>
                <option value="naive">Naive</option>
              </select>
            </div>
          </div>

          {/* Submit Action */}
          <button
            type="button"
            className="btn-run-both"
            style={{ marginTop: 6 }}
            onClick={handleRun}
            disabled={loading || !prompt.trim()}
          >
            {loading ? (
              <>Running Defense Pipeline...</>
            ) : (
              <>
                <Play size={16} color="#fff" />
                Run Both Sides
              </>
            )}
          </button>

          {error && (
            <div style={{ marginTop: 12, color: 'var(--color-danger)', fontSize: '0.85rem' }}>
              Error: {error}
            </div>
          )}
        </div>

        {/* Right Card: Results Comparison (Expanded) */}
        <div className="ps-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ps-card-header">
            <div className="card-title-group">
              <span className="card-title-icon">
                <BarChart2 size={20} />
              </span>
              <h2>Results Comparison</h2>
            </div>
            {totalDuration != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                <Clock size={15} color="var(--color-primary)" />
                <span>Total Time: {formatSeconds(totalDuration)}</span>
              </div>
            )}
          </div>

          {/* Two Expanded Comparison Panels Side-by-Side */}
          <div className="results-comparison-grid" style={{ flex: 1 }}>
            {/* Panel 1: Without Defense */}
            <div className="comparison-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header">
                <div className="panel-title-info">
                  <div className="panel-icon-wrap without">
                    <ShieldAlert size={18} />
                  </div>
                  <div className="panel-header-text">
                    <h3>Without Defense</h3>
                    <p>Naive prompt, no gate</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {withoutDefense?.response && (
                    <button
                      type="button"
                      title="Copy response"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.74rem' }}
                      onClick={() => copyToClipboard(withoutDefense.response, true)}
                    >
                      <Copy size={14} />
                      {copiedLeft ? 'Copied' : ''}
                    </button>
                  )}
                  {withoutDefense && (
                    <span className={`ps-badge ${withoutDefense.blocked ? 'badge-green' : 'badge-red'}`}>
                      {withoutDefense.verdict === 'blocked' ? 'Blocked' : 'Answered'}
                    </span>
                  )}
                </div>
              </div>

              {/* Spacious Response Textbox */}
              <div className="response-textbox response-tall" style={{ flex: 1, minHeight: '380px' }}>
                {withoutDefense ? (
                  withoutDefense.response || (withoutDefense.error ? `Error: ${withoutDefense.error}` : 'No response text.')
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {loading ? 'Evaluating naive prompt against unprotected Ollama model...' : 'Click "Run Both Sides" to test the undefended prompt.'}
                  </span>
                )}
              </div>

              {/* Canary followed alert */}
              {withoutDefense && withoutDefense.canary_followed != null && (
                <div className={`panel-alert-box ${withoutDefense.canary_followed ? 'alert-box-danger' : 'alert-box-success'}`} style={{ marginTop: 'auto' }}>
                  <strong>
                    {withoutDefense.canary_followed ? '⚠ Canary Followed: Yes' : '✔ Canary Followed: No'}
                  </strong>
                  <span style={{ fontSize: '0.74rem', opacity: 0.9 }}>
                    {withoutDefense.canary_followed
                      ? 'Attack succeeded against the undefended model (canary followed).'
                      : 'Model did not repeat the canary string.'}
                  </span>
                </div>
              )}

              {/* Timing */}
              {withoutDefense && (
                <div className="panel-footer-time" style={{ marginTop: 8 }}>
                  <Clock size={13} />
                  <span>Time: {Math.round(withoutDefense.total_ms || 0)} ms</span>
                </div>
              )}
            </div>

            {/* Panel 2: With Defense */}
            <div className="comparison-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header">
                <div className="panel-title-info">
                  <div className="panel-icon-wrap with">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="panel-header-text">
                    <h3>With Defense</h3>
                    <p>
                      {config === 'all'
                        ? 'All layers: classifier + perplexity + segregator'
                        : `Layer: ${config}`}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {withDefense?.response && (
                    <button
                      type="button"
                      title="Copy response"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.74rem' }}
                      onClick={() => copyToClipboard(withDefense.response, false)}
                    >
                      <Copy size={14} />
                      {copiedRight ? 'Copied' : ''}
                    </button>
                  )}
                  {withDefense && (
                    <span className={`ps-badge ${withDefense.blocked ? 'badge-green' : 'badge-amber'}`}>
                      {withDefense.blocked ? 'Blocked' : 'Answered'}
                    </span>
                  )}
                </div>
              </div>

              {/* Response Textbox */}
              <div className="response-textbox" style={{ minHeight: '180px', maxHeight: '280px' }}>
                {withDefense ? (
                  withDefense.response || (withDefense.blocked ? (withDefense.reason || "I can't help with that request.") : 'Empty response.')
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {loading ? 'Executing defense verification layers & prompt hardening...' : 'Click "Run Both Sides" to test with PromptShield active.'}
                  </span>
                )}
              </div>

              {/* Defense Layer Results Table */}
              {withDefense?.layers && withDefense.layers.length > 0 && (
                <div className="defense-layer-box">
                  <div className="defense-layer-title">
                    <ShieldCheck size={14} color="var(--color-success)" />
                    <span>Defense Layer Results</span>
                  </div>
                  <table className="layer-table">
                    <thead>
                      <tr>
                        <th>Layer</th>
                        <th>Result</th>
                        <th>Score</th>
                        <th>Threshold</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withDefense.layers.map((layer, idx) => {
                        const isPass = layer.allowed;
                        const scoreVal = layer.score != null ? Number(layer.score).toFixed(3) : '—';
                        const thresholdVal = layer.threshold != null ? Number(layer.threshold).toFixed(1) : '—';
                        const latencyVal = Math.round(layer.latency_ms || 0) + ' ms';
                        return (
                          <tr key={idx}>
                            <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{layer.name}</td>
                            <td>
                              <span className={`ps-badge ${isPass ? 'badge-green' : 'badge-red'}`} style={{ padding: '1px 6px', fontSize: '0.7rem' }}>
                                {isPass ? 'Pass' : 'Block'}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{scoreVal}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{thresholdVal}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{latencyVal}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Canary followed status */}
              {withDefense && withDefense.canary_followed != null && (
                <div className={`panel-alert-box ${withDefense.canary_followed ? 'alert-box-danger' : 'alert-box-success'}`} style={{ marginTop: 'auto' }}>
                  <strong>
                    {withDefense.canary_followed ? '⚠ Canary Followed: Yes' : '✔ Canary Followed: No'}
                  </strong>
                </div>
              )}

              {/* Timing */}
              {withDefense && (
                <div className="panel-footer-time" style={{ marginTop: 8 }}>
                  <Clock size={13} />
                  <span>Time: {Math.round(withDefense.total_ms || 0)} ms</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
