import React, { useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function TreeView({ tree }) {
  if (!tree || Object.keys(tree).length === 0) return <div className="muted">{JSON.stringify(tree)}</div>;

  const renderNode = (obj) => {
    return Object.entries(obj).map(([k, v]) => (
      <div key={k} className="tree-node">
        <div className="tree-label">{k}</div>
        {v && Object.keys(v).length ? <div className="tree-children">{renderNode(v)}</div> : null}
      </div>
    ));
  };

  return <div className="tree">{renderNode(tree)}</div>;
}

export default function App() {
  const [text, setText] = useState('A->B\nA->C\nB->D\nC->E\nE->F\nX->Y\nY->Z\nZ->X');
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);
  const [err, setErr] = useState('');

  const data = useMemo(
    () => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    [text]
  );

  async function submit() {
    setErr('');
    setResp(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/bfhl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'Request failed');
      setResp(json);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>BFHL Challenge</h1>
      <p className="muted">API: <code>{API_URL}/bfhl</code></p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="input"
        placeholder="Enter edges like A->B, one per line"
      />

      <div className="row">
        <button className="btn" onClick={submit} disabled={loading}>
          {loading ? 'Submitting...' : 'Submit'}
        </button>
        <div className="muted">Parsed edges: {data.length}</div>
      </div>

      {err ? <div className="error">{err}</div> : null}

      {resp ? (
        <div className="grid">
          <div className="card">
            <h2>Summary</h2>
            <pre className="pre">{JSON.stringify(resp.summary, null, 2)}</pre>
          </div>
          <div className="card">
            <h2>Invalid & Duplicates</h2>
            <pre className="pre">{JSON.stringify({ invalid_entries: resp.invalid_entries, duplicate_edges: resp.duplicate_edges }, null, 2)}</pre>
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>Hierarchies</h2>
            <div className="hier">
              {resp.hierarchies?.map((h, idx) => (
                <div key={idx} className="hcard">
                  <div className="hhead">
                    <div><b>root:</b> {h.root}</div>
                    {h.has_cycle ? <div className="badge">cycle</div> : <div className="badge ok">depth {h.depth}</div>}
                  </div>
                  <div className="treewrap">
                    <TreeView tree={h.tree} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>Raw Response</h2>
            <pre className="pre">{JSON.stringify(resp, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

