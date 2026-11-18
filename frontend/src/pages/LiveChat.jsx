import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import {
  Target,
  BarChart2,
  Clock,
  Play,
  Info,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Copy,
  AlertTriangle,
  Layers,
  Cpu,
  FileText
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

      {/* Single Query Result Telemetry & Visual Analytics */}
      {result && (
        <SingleQueryAnalytics
          result={result}
          withoutDefense={withoutDefense}
          withDefense={withDefense}
          formatSeconds={formatSeconds}
        />
      )}
    </div>
  );
}

function SingleQueryAnalytics({ result, withoutDefense, withDefense, formatSeconds }) {
  if (!result) return null;

  const isBlocked = withDefense?.blocked;
  const isCanaryExposedWithout = withoutDefense?.canary_followed === true;
  const isCanaryExposedWith = withDefense?.canary_followed === true;

  const gateTime = withDefense?.defense_compute_ms != null
    ? withDefense.defense_compute_ms
    : (withDefense?.defense_round_trip_ms != null ? withDefense.defense_round_trip_ms : (isBlocked ? withDefense?.total_ms : 0));

  const totalUndefended = withoutDefense?.total_ms || 1;
  const totalDefended = withDefense?.total_ms || 1;
  const maxTime = Math.max(totalUndefended, totalDefended, 100);

  const undefendedPct = Math.min(100, Math.max(8, (totalUndefended / maxTime) * 100));
  const gatePct = Math.min(100, Math.max(4, (gateTime / maxTime) * 100));
  const llmDefendedTime = isBlocked ? 0 : Math.max(0, totalDefended - gateTime);
  const llmDefendedPct = isBlocked ? 0 : Math.min(100 - gatePct, Math.max(4, (llmDefendedTime / maxTime) * 100));

  const layers = withDefense?.layers || [];
  const retrievedDocs = withDefense?.retrieved || withoutDefense?.retrieved || [];
  const targetDocName = result?.attack?.poisoned_doc ? `${result.attack.id.toLowerCase()}_` : null;

  return (
    <div className="ps-card" style={{ marginTop: '24px' }}>
      {/* Header */}
      <div className="ps-card-header" style={{ marginBottom: 16 }}>
        <div className="card-title-group">
          <span className="card-title-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: 'var(--color-primary)' }}>
            <BarChart2 size={20} />
          </span>
          <div>
            <h2>Single Query Defense Telemetry & Visual Analysis</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Real-time inspection of defense layer scores, detection thresholds, and execution latency for this specific query run.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`ps-badge ${isBlocked ? 'badge-green' : (isCanaryExposedWithout && !isCanaryExposedWith ? 'badge-cyan' : 'badge-blue')}`}>
            {isBlocked ? 'Shield Engaged: Blocked' : (isCanaryExposedWithout && !isCanaryExposedWith ? 'Prompt Hardened: Safe' : 'Query Passed')}
          </span>
          {result?.attack?.id && (
            <span className="ps-badge badge-purple">
              Attack: {result.attack.id}
            </span>
          )}
        </div>
      </div>

      {/* 1. Verdict Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          marginBottom: 18,
          background: isBlocked
            ? 'var(--color-success-bg)'
            : (isCanaryExposedWithout && !isCanaryExposedWith
              ? 'rgba(56, 189, 248, 0.12)'
              : (isCanaryExposedWith ? 'var(--color-danger-bg)' : 'rgba(56, 189, 248, 0.08)')),
          border: `1px solid ${
            isBlocked
              ? 'var(--color-success-border)'
              : (isCanaryExposedWithout && !isCanaryExposedWith
                ? 'rgba(56, 189, 248, 0.3)'
                : (isCanaryExposedWith ? 'var(--color-danger-border)' : 'var(--border-subtle)'))
          }`,
        }}
      >
        <div style={{ flexShrink: 0 }}>
          {isBlocked ? (
            <ShieldCheck size={28} color="var(--color-success)" />
          ) : (isCanaryExposedWithout && !isCanaryExposedWith ? (
            <ShieldCheck size={28} color="var(--color-primary)" />
          ) : (isCanaryExposedWith ? (
            <ShieldAlert size={28} color="var(--color-danger)" />
          ) : (
            <CheckCircle size={28} color="var(--color-secondary)" />
          )))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: '0.98rem', color: isBlocked ? 'var(--color-success)' : (isCanaryExposedWith ? 'var(--color-danger)' : 'var(--text-primary)') }}>
            {isBlocked
              ? 'Threat Neutralized: Prompt Injection Intercepted by Defense Gate'
              : (isCanaryExposedWithout && !isCanaryExposedWith
                ? 'Canary Protected: Prompt Hardening Prevented Canary Leakage'
                : (isCanaryExposedWith
                  ? 'Vulnerability Warning: Canary Leaked Through Defense'
                  : 'Query Cleared: Response Generated Under Prompt Protection'))}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {withDefense?.reason
              ? `Reason: ${withDefense.reason}`
              : (isBlocked
                ? 'Security gate classified input as adversarial and safely aborted before reaching the language model.'
                : 'Prompt verification cleared all active security checks and returned the model response safely.')}
          </div>
        </div>
      </div>

      {/* 2. Top Metric Scorecards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        {/* Metric 1 */}
        <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Defense Gate Verdict
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: isBlocked ? 'var(--color-success)' : 'var(--color-primary)', marginTop: 4 }}>
            {isBlocked ? 'BLOCKED' : 'ALLOWED'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Config: <strong>{result.with_config}</strong> ({result.with_prompt_mode})
          </div>
        </div>

        {/* Metric 2 */}
        <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Canary Leakage Check
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: isCanaryExposedWith ? 'var(--color-danger)' : 'var(--color-success)', marginTop: 4 }}>
            {withoutDefense?.canary_followed != null
              ? (isCanaryExposedWith ? 'LEAKED' : 'SECURED')
              : 'N/A (No Canary)'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {withoutDefense?.canary_followed != null
              ? `Undefended: ${isCanaryExposedWithout ? 'Exposed ⚠' : 'Protected ✔'}`
              : 'Standard prompt query'}
          </div>
        </div>

        {/* Metric 3 */}
        <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Defense Gate Latency
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            {gateTime != null ? `${Math.round(gateTime)} ms` : '< 1 ms'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {withDefense?.defense_round_trip_ms != null ? `Round-trip: ${Math.round(withDefense.defense_round_trip_ms)} ms` : 'In-process defense pipeline'}
          </div>
        </div>

        {/* Metric 4 */}
        <div className="ps-card" style={{ background: 'var(--bg-card-sub)', padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            {isBlocked ? 'LLM Compute Saved' : 'Defense Overhead'}
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: isBlocked ? 'var(--color-success)' : 'var(--color-warning)', marginTop: 4 }}>
            {isBlocked
              ? `~${Math.round(totalUndefended)} ms`
              : `+${Math.max(0, Math.round(totalDefended - totalUndefended))} ms`}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {isBlocked ? 'Model generation avoided' : `Total: ${Math.round(totalDefended)} ms vs ${Math.round(totalUndefended)} ms`}
          </div>
        </div>
      </div>

      {/* 3. Graphs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {/* Left Graph: Defense Layer Scores vs Thresholds */}
        <div style={{ background: 'var(--bg-card-sub)', borderRadius: 'var(--radius-md)', padding: '16px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={17} color="var(--color-primary)" />
              <strong style={{ fontSize: '0.9rem' }}>Defense Layer Threat Meters</strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {layers.length > 0 ? `${layers.length} active layers` : 'Prompt hardening'}
            </span>
          </div>

          {layers.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-card)' }}>
              <ShieldCheck size={28} color="var(--color-primary)" style={{ margin: '0 auto 8px auto', display: 'block' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Hardened Prompt Mode Only</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 4, maxWidth: '300px', margin: '4px auto 0 auto' }}>
                Prompt hardening applies strict delimiter framing and system instructions without neural classification gates.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {layers.map((layer, idx) => {
                const isPass = layer.allowed;
                const score = layer.score != null ? Number(layer.score) : null;
                const threshold = layer.threshold != null ? Number(layer.threshold) : null;
                const isClassifier = layer.name.toLowerCase().includes('classifier');
                const isPerplexity = layer.name.toLowerCase().includes('perplexity');

                let scorePct = 0;
                let threshPct = 50;

                if (isClassifier && score != null && threshold != null) {
                  scorePct = Math.min(100, Math.max(0, score * 100));
                  threshPct = Math.min(100, Math.max(0, threshold * 100));
                } else if (isPerplexity && score != null && threshold != null) {
                  const maxP = Math.max(threshold * 1.5, score * 1.2, 100);
                  scorePct = Math.min(100, Math.max(0, (score / maxP) * 100));
                  threshPct = Math.min(100, Math.max(0, (threshold / maxP) * 100));
                } else {
                  scorePct = isPass ? 20 : 90;
                  threshPct = 50;
                }

                return (
                  <div key={idx} style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.84rem' }}>
                          {layer.name}
                        </span>
                        <span className={`ps-badge ${isPass ? 'badge-green' : 'badge-red'}`} style={{ padding: '1px 6px', fontSize: '0.68rem' }}>
                          {isPass ? 'PASS' : 'BLOCK'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {layer.latency_ms ? `${Math.round(layer.latency_ms)} ms` : ''}
                      </span>
                    </div>

                    {score != null && threshold != null ? (
                      <div>
                        <div style={{ position: 'relative', height: 16, background: 'var(--bg-card)', borderRadius: 4, overflow: 'visible', margin: '8px 0 6px 0', border: '1px solid var(--border-subtle)' }}>
                          {/* Fill Bar */}
                          <div
                            style={{
                              height: '100%',
                              width: `${scorePct}%`,
                              borderRadius: 3,
                              background: isPass
                                ? 'linear-gradient(90deg, var(--color-secondary), var(--color-success))'
                                : 'linear-gradient(90deg, var(--color-warning), var(--color-danger))',
                              transition: 'width 0.4s ease',
                            }}
                          />

                          {/* Threshold Marker Line */}
                          <div
                            title={`Threshold: ${threshold}`}
                            style={{
                              position: 'absolute',
                              top: -3,
                              bottom: -3,
                              left: `${threshPct}%`,
                              width: 2,
                              background: '#f8fafc',
                              boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)',
                              zIndex: 2,
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                top: -16,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '0.64rem',
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Cutoff
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          <span>Score: <strong style={{ color: isPass ? 'var(--color-success)' : 'var(--color-danger)' }}>{score.toFixed(3)}</strong></span>
                          <span>Threshold: <strong>{threshold.toFixed(2)}</strong></span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {layer.reason || (isPass ? 'Allowed by security rule' : 'Blocked')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Graph: Pipeline Timing & Latency Waterfall */}
        <div style={{ background: 'var(--bg-card-sub)', borderRadius: 'var(--radius-md)', padding: '16px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={17} color="var(--color-primary)" />
              <strong style={{ fontSize: '0.9rem' }}>Pipeline Execution Timing & Latency</strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Comparative execution speed
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Undefended Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
                <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>1. Without Defense (Naive)</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {Math.round(totalUndefended)} ms
                </span>
              </div>
              <div style={{ height: 24, background: 'var(--bg-input)', borderRadius: 5, overflow: 'hidden', display: 'flex', border: '1px solid var(--border-card)' }}>
                <div
                  style={{
                    width: `${undefendedPct}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #b91c1c, var(--color-danger))',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 8,
                    fontSize: '0.7rem',
                    color: '#fff',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  LLM Inference ({Math.round(totalUndefended)} ms)
                </div>
              </div>
            </div>

            {/* Defended Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>2. With Defense (PromptShield)</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {Math.round(totalDefended)} ms
                </span>
              </div>
              <div style={{ height: 24, background: 'var(--bg-input)', borderRadius: 5, overflow: 'hidden', display: 'flex', border: '1px solid var(--border-card)' }}>
                {/* Gate segment */}
                <div
                  style={{
                    width: `${gatePct}%`,
                    height: '100%',
                    background: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.68rem',
                    color: '#060a12',
                    fontWeight: 700,
                    minWidth: 32,
                  }}
                  title={`Defense Gate: ${Math.round(gateTime)} ms`}
                >
                  Gate {Math.round(gateTime)}ms
                </div>

                {/* LLM segment if not blocked */}
                {!isBlocked && llmDefendedTime > 0 && (
                  <div
                    style={{
                      width: `${llmDefendedPct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-secondary), var(--color-success))',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 8,
                      fontSize: '0.7rem',
                      color: '#060a12',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    LLM Generation ({Math.round(llmDefendedTime)} ms)
                  </div>
                )}

                {/* Blocked indicator */}
                {isBlocked && (
                  <div
                    style={{
                      flex: 1,
                      height: '100%',
                      background: 'repeating-linear-gradient(45deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.08) 8px, transparent 8px, transparent 16px)',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 10,
                      fontSize: '0.7rem',
                      color: 'var(--color-success)',
                      fontWeight: 600,
                    }}
                  >
                    ⚡ Intercepted early — 0 ms LLM inference
                  </div>
                )}
              </div>
            </div>

            {/* Timing insight callout */}
            <div style={{ background: 'var(--bg-input)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {isBlocked ? (
                <span>
                  <strong style={{ color: 'var(--color-success)' }}>⚡ Fast-Fail Protection:</strong> PromptShield blocked this prompt in <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(gateTime)} ms</span>, preventing harmful outputs and avoiding ~<span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(totalUndefended)} ms</span> of costly GPU model inference.
                </span>
              ) : (
                <span>
                  <strong style={{ color: 'var(--color-primary)' }}>🛡 Low-Overhead Verification:</strong> The defense gate added only <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(gateTime)} ms</span> of latency overhead before authorizing the model response.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Retrieved Context Documents (for RAG queries) */}
      {retrievedDocs.length > 0 && (
        <div style={{ marginTop: 16, background: 'var(--bg-card-sub)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <FileText size={16} color="var(--color-primary)" />
            <strong style={{ fontSize: '0.86rem' }}>Retrieved Context Documents ({retrievedDocs.length})</strong>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {retrievedDocs.map((doc, i) => {
              const isPoisoned = targetDocName && doc.toLowerCase().includes(targetDocName);
              return (
                <span
                  key={i}
                  className={`ps-badge ${isPoisoned ? 'badge-amber' : 'badge-blue'}`}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                >
                  {isPoisoned ? '⚠ Poisoned Doc: ' : '📄 '}
                  {doc}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
