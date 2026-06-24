function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseNode(edgeStr) {
  const trimmed = String(edgeStr ?? '').trim();
  if (!trimmed) return null;
  const m = /^([A-Z])->([A-Z])$/.exec(trimmed);
  if (!m) return null;
  if (m[1] === m[2]) return null;
  return { from: m[1], to: m[2], normalized: `${m[1]}->${m[2]}` };
}

function computeDepth(tree) {
  const dfs = (nodeObj) => {
    let best = 0;
    for (const k of Object.keys(nodeObj)) {
      best = Math.max(best, 1 + dfs(nodeObj[k] || {}));
    }
    return best;
  };
  const rootKeys = Object.keys(tree);
  if (rootKeys.length === 0) return 0;
  return 1 + dfs(tree[rootKeys[0]] || {});
}

function buildComponent({ edgesByParentChild, adj, allNodes, rootCandidate }) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const n of allNodes) color.set(n, WHITE);

  let hasCycle = false;

  const dfsCycle = (u) => {
    if (hasCycle) return;
    color.set(u, GRAY);
    for (const v of (adj.get(u) || [])) {
      if (!color.has(v)) continue;
      if (color.get(v) === GRAY) { hasCycle = true; return; }
      if (color.get(v) === WHITE) dfsCycle(v);
    }
    color.set(u, BLACK);
  };

  const start = rootCandidate ?? [...allNodes].sort()[0];
  for (const n of [...allNodes]) {
    if (color.get(n) === WHITE) dfsCycle(n);
    if (hasCycle) break;
  }

  if (hasCycle) {
    return { root: start, tree: {}, has_cycle: true };
  }

  let root = rootCandidate;
  if (!root) root = [...allNodes].sort()[0];

  const buildNode = (node) => {
    const children = (adj.get(node) || []).filter((c) => edgesByParentChild.get(c) === node);
    const out = {};
    for (const ch of children) {
      out[ch] = buildNode(ch);
    }
    return out;
  };

  const tree = { [root]: buildNode(root) };
  return { root, tree, depth: computeDepth(tree) };
}

function processRequest(data) {
  const invalid_entries = [];
  const duplicate_edges = [];

  const seenEdge = new Set();
  const firstParentForChild = new Map();
  const adj = new Map();
  const allNodesSet = new Set();
  const duplicatesPushed = new Set();
  const validEdges = [];

  for (const entry of data) {
    const parsed = parseNode(entry);
    if (!parsed) {
      invalid_entries.push(String(entry ?? '').trim());
      continue;
    }

    allNodesSet.add(parsed.from);
    allNodesSet.add(parsed.to);

    if (seenEdge.has(parsed.normalized)) {
      if (!duplicatesPushed.has(parsed.normalized)) {
        duplicate_edges.push(parsed.normalized);
        duplicatesPushed.add(parsed.normalized);
      }
      continue;
    }
    seenEdge.add(parsed.normalized);

    validEdges.push(parsed);

    if (!adj.has(parsed.from)) adj.set(parsed.from, []);
    adj.get(parsed.from).push(parsed.to);

    if (!firstParentForChild.has(parsed.to)) {
      firstParentForChild.set(parsed.to, parsed.from);
    }
  }

  const childrenSet = new Set(firstParentForChild.keys());
  const allNodes = [...allNodesSet];

  const undAdj = new Map();
  for (const n of allNodes) undAdj.set(n, new Set());
  for (const { from, to } of validEdges) {
    undAdj.get(from).add(to);
    undAdj.get(to).add(from);
  }

  const visited = new Set();
  const hierarchies = [];
  let total_trees = 0, total_cycles = 0;
  let largest_tree_root = null, largest_depth = -1;

  for (const startNode of [...allNodes].sort()) {
    if (visited.has(startNode)) continue;

    const queue = [startNode];
    visited.add(startNode);
    const componentNodes = new Set();
    while (queue.length) {
      const u = queue.shift();
      componentNodes.add(u);
      for (const v of undAdj.get(u) || []) {
        if (!visited.has(v)) { visited.add(v); queue.push(v); }
      }
    }

    const sortedComp = [...componentNodes].sort();
    const roots = sortedComp.filter((n) => !childrenSet.has(n));
    const rootCandidate = roots.length > 0 ? roots[0] : sortedComp[0];

    const resObj = buildComponent({
      edgesByParentChild: firstParentForChild,
      adj, allNodes: sortedComp, rootCandidate
    });

    if (resObj.has_cycle) {
      total_cycles += 1;
    } else {
      total_trees += 1;
      const d = resObj.depth;
      const r = resObj.root;
      if (d > largest_depth || (d === largest_depth && r < largest_tree_root)) {
        largest_depth = d;
        largest_tree_root = r;
      }
    }

    hierarchies.push(resObj);
  }

  return {
    user_id: 'jyotijuneja_24062026',
    email_id: 'jyoti.juneja@chitkara.edu.in',
    college_roll_number: '24BCS80073',
    hierarchies,
    invalid_entries,
    duplicate_edges,
    summary: {
      total_trees,
      total_cycles,
      largest_tree_root: largest_tree_root ?? ''
    }
  };
}

module.exports = async (req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const data = Array.isArray(parsed.data) ? parsed.data : null;
        if (!data) {
          res.status(400).json({ error: 'Body must be JSON with field data: string[]' });
          return resolve();
        }
        const result = processRequest(data);
        res.json(result);
        resolve();
      } catch (e) {
        res.status(400).json({ error: 'Invalid JSON body' });
        resolve();
      }
    });
  });
};
