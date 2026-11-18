import { useEffect, useState } from 'react';
import { api } from '../api.js';

// ok: true = green, false = red, null = neutral
function Item({ ok, label, detail }) {
  const tone = ok === null ? 'neutral' : ok ? 'good' : 'bad';
  return (
    <span className="status-item">
      <span className={`dot ${tone}`} />
      <span>{label}</span>
      {detail && <em>{detail}</em>}
    </span>
  );
}

export default function StatusBar() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .status()
        .then((s) => alive && (setStatus(s), setError(null)))
        .catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (error) return <div className="statusbar bad-bar">Console server not reachable: {error}</div>;
  if (!status) return <div className="statusbar">Checking the system…</div>;

  const d = status.defense;
  const remote = d.mode === 'remote';
  return (
    <div className="statusbar">
      <Item
        ok={remote ? d.reachable : null}
        label={remote ? 'Defense laptop' : 'Defense (this machine)'}
        detail={
          remote
            ? d.reachable
              ? `reachable · classifier ${d.checkpoint ? 'loaded' : 'MISSING'}`
              : 'unreachable: the defended side refuses everything'
            : null
        }
      />
      <Item
        ok={status.ollama.reachable && status.ollama.model_pulled}
        label={`Model ${status.ollama.model}`}
        detail={!status.ollama.reachable ? 'Ollama not running' : !status.ollama.model_pulled ? 'not pulled' : null}
      />
      <Item ok={null} label={`Attack set ${status.attack_set}`} detail={`${status.attacks} attacks`} />
      <Item ok={status.clean_docs > 0} label="Clean documents" detail={String(status.clean_docs)} />
    </div>
  );
}
