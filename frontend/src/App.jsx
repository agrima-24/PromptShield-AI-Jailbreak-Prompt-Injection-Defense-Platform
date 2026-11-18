import React, { useState, useEffect } from 'react';
import { api } from './api.js';

import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';

import LiveChat from './pages/LiveChat.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Attacks from './pages/Attacks.jsx';
import Results from './pages/Results.jsx';
import QueryHistory from './pages/QueryHistory.jsx';

import './theme.css';

export default function App() {
  // Live Chat is the primary focus and default landing page
  const [tab, setTab] = useState('chat');
  const [preset, setPreset] = useState(null);
  const [status, setStatus] = useState(null);

  // Poll system status periodically
  useEffect(() => {
    let alive = true;
    const fetchStatus = () => {
      api.status()
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch((err) => console.error('Failed to fetch status:', err));
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const openInChat = (attackId) => {
    setPreset(attackId);
    setTab('chat');
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={tab}
        setTab={setTab}
        status={status}
      />

      {/* Main Content Pane */}
      <div className="app-main">
        {/* Header Bar */}
        <Header
          activeTab={tab}
          status={status}
        />

        {/* Tab Routing */}
        <main>
          {tab === 'chat' && (
            <LiveChat
              preset={preset}
              onPresetUsed={() => setPreset(null)}
            />
          )}
          {tab === 'dashboard' && (
            <Dashboard
              onNavigate={(targetTab) => setTab(targetTab)}
            />
          )}
          {tab === 'attacks' && (
            <Attacks
              onOpenInChat={openInChat}
            />
          )}
          {tab === 'results' && (
            <Results />
          )}
          {tab === 'history' && (
            <QueryHistory
              onTestInChat={(queryText, attackId) => {
                setPreset(attackId);
                setTab('chat');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
