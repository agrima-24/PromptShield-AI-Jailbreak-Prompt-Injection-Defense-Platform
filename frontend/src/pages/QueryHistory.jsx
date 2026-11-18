import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Clock,
  Search,
  Trash2,
  X,
  ShieldCheck,
  ShieldAlert,
  ArrowRight
} from '../components/Icons.jsx';

export default function QueryHistory({ onTestInChat }) {
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const PAGE_SIZE = 15;

  const loadHistory = () => {
    setLoading(true);
    api.history({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search || undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
    })
      .then((data) => {
        setHistory(data.history || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadHistory();
  }, [page, categoryFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(0);
    loadHistory();
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this historical query record?')) return;
    try {
      await api.deleteHistory(id);
      loadHistory();
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleClearAll = async () => {
    try {
      await api.clearHistory();
      setShowClearConfirm(false);
      setPage(0);
      loadHistory();
    } catch (err) {
      alert('Clear failed: ' + err.message);
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

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  const getBadgeClass = (category = '') => {
    const c = category.toLowerCase();
    if (c.includes('canary')) return 'badge-cyan';
    if (c.includes('harmful')) return 'badge-purple';
    if (c.includes('matched') || c.includes('indirect')) return 'badge-amber';
    return 'badge-blue';
  };

  return (
    <div className="page-container">
      {/* Header & Filter Card */}
      <div className="ps-card">
        <div className="ps-card-header">
          <div className="card-title-group">
            <span className="card-title-icon"><Clock size={20} /></span>
            <div>
              <h2>Audited Query History ({total} records)</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Persistent log of all live test executions, naive completions, and defense verdicts.
              </p>
            </div>
          </div>
          {total > 0 && (
            <button
              type="button"
              className="ps-badge badge-red"
              style={{ padding: '8px 14px', cursor: 'pointer', background: 'rgba(239, 68, 68, 0.15)' }}
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 size={14} style={{ marginRight: 6 }} />
              Clear All History
            </button>
          )}
        </div>

        {/* Search & Filter Bar */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <Search size={16} />
            </span>
            <input
              type="text"
              className="input-custom"
              style={{ paddingLeft: 38 }}
              placeholder="Search by query string or attack ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="select-custom"
            style={{ width: 'auto', minWidth: '180px' }}
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All Categories</option>
            <option value="direct-canary">Direct: Canary</option>
            <option value="direct-harmful">Direct: Harmful</option>
            <option value="indirect">Indirect Injection</option>
            <option value="custom">Custom Queries</option>
          </select>

          <button type="submit" className="btn-run-both" style={{ width: 'auto', padding: '10px 18px', fontSize: '0.88rem' }}>
            Search
          </button>
        </form>
      </div>

      {/* History Table */}
      <div className="ps-card">
        <div className="ps-table-wrapper">
          <table className="ps-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>#</th>
                <th style={{ width: '160px' }}>Timestamp</th>
                <th>Query Text</th>
                <th style={{ width: '130px' }}>Category</th>
                <th style={{ width: '100px' }}>Config</th>
                <th style={{ width: '120px' }}>Without Def.</th>
                <th style={{ width: '120px' }}>With Def.</th>
                <th style={{ width: '80px' }}>Canary</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="ps-table-empty">Loading query records...</td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={9} className="ps-table-empty">No query records found.</td>
                </tr>
              ) : (
                history.map((r, i) => {
                  const withoutBlocked = r.verdict_without === 'blocked';
                  const withBlocked = r.verdict_with === 'blocked';
                  const canaryYes = r.canary_followed === 1;

                  return (
                    <tr
                      key={r.id || i}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedItem(r)}
                    >
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {r.id}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatTime(r.timestamp)}
                      </td>
                      <td style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.attack_id ? <strong style={{ color: 'var(--color-primary)', marginRight: 6 }}>{r.attack_id}:</strong> : null}
                        {r.query}
                      </td>
                      <td>
                        <span className={`ps-badge ${getBadgeClass(r.category || '')}`}>
                          {r.category || 'custom'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {r.config}
                      </td>
                      <td>
                        <span className={`ps-badge ${withoutBlocked ? 'badge-green' : 'badge-red'}`}>
                          {withoutBlocked ? 'Blocked' : 'Answered'}
                        </span>
                      </td>
                      <td>
                        <span className={`ps-badge ${withBlocked ? 'badge-green' : 'badge-red'}`}>
                          {withBlocked ? 'Blocked' : 'Answered'}
                        </span>
                      </td>
                      <td>
                        {r.canary_followed == null ? (
                          <span style={{ color: 'var(--text-dim)' }}>—</span>
                        ) : (
                          <span style={{ color: canaryYes ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                            {canaryYes ? 'Yes' : 'No'}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="ps-badge badge-blue"
                            style={{ cursor: 'pointer', padding: '4px 8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem(r);
                            }}
                          >
                            Inspect
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Page {page + 1} of {totalPages} ({total} items)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-run-both"
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-run-both"
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspect Item Modal */}
      {selectedItem && (
        <div className="ps-modal-backdrop" onClick={() => setSelectedItem(null)}>
          <div className="ps-modal" style={{ maxWidth: '840px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--color-primary)' }}><Clock size={20} /></span>
                <h3>Query Inspection #{selectedItem.id}</h3>
                <span className={`ps-badge ${getBadgeClass(selectedItem.category || '')}`}>
                  {selectedItem.category || 'custom'}
                </span>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSelectedItem(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="ps-modal-body">
              <div>
                <label className="form-label">Submitted Query Prompt</label>
                <div className="response-textbox" style={{ minHeight: '60px' }}>
                  {selectedItem.query}
                </div>
              </div>

              {/* Side-by-side Response comparison */}
              <div className="results-comparison-grid">
                <div className="comparison-panel">
                  <div className="panel-header">
                    <div className="panel-title-info">
                      <div className="panel-icon-wrap without"><ShieldAlert size={16} /></div>
                      <div>
                        <strong style={{ fontSize: '0.88rem' }}>Without Defense</strong>
                      </div>
                    </div>
                    <span className={`ps-badge ${selectedItem.verdict_without === 'blocked' ? 'badge-green' : 'badge-red'}`}>
                      {selectedItem.verdict_without}
                    </span>
                  </div>
                  <div className="response-textbox" style={{ minHeight: '120px' }}>
                    {selectedItem.response_without || 'No response.'}
                  </div>
                  <div className="panel-footer-time">
                    <span>Latency: {Math.round(selectedItem.latency_without || 0)} ms</span>
                  </div>
                </div>

                <div className="comparison-panel">
                  <div className="panel-header">
                    <div className="panel-title-info">
                      <div className="panel-icon-wrap with"><ShieldCheck size={16} /></div>
                      <div>
                        <strong style={{ fontSize: '0.88rem' }}>With Defense ({selectedItem.config})</strong>
                      </div>
                    </div>
                    <span className={`ps-badge ${selectedItem.verdict_with === 'blocked' ? 'badge-green' : 'badge-red'}`}>
                      {selectedItem.verdict_with}
                    </span>
                  </div>
                  <div className="response-textbox" style={{ minHeight: '120px' }}>
                    {selectedItem.response_with || 'No response.'}
                  </div>
                  <div className="panel-footer-time">
                    <span>Latency: {Math.round(selectedItem.latency_with || 0)} ms</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ps-modal-footer">
              {onTestInChat && (
                <button
                  type="button"
                  className="btn-run-both"
                  style={{ width: 'auto', padding: '10px 18px' }}
                  onClick={() => {
                    const q = selectedItem.query;
                    const a = selectedItem.attack_id;
                    setSelectedItem(null);
                    onTestInChat(q, a);
                  }}
                >
                  Load in Live Chat <ArrowRight size={14} />
                </button>
              )}
              <button
                type="button"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)', padding: '10px 18px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                onClick={() => setSelectedItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="ps-modal-backdrop" onClick={() => setShowClearConfirm(false)}>
          <div className="ps-modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3 style={{ color: 'var(--color-danger)' }}>Clear All Query History</h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setShowClearConfirm(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="ps-modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Are you sure you want to delete all historical query execution records from SQLite? This action cannot be undone.
              </p>
            </div>
            <div className="ps-modal-footer">
              <button
                type="button"
                className="btn-run-both"
                style={{ width: 'auto', background: 'var(--color-danger)', padding: '8px 16px' }}
                onClick={handleClearAll}
              >
                Yes, Delete All
              </button>
              <button
                type="button"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
