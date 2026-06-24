const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function parseNode(edgeStr) {
  const trimmed = String(edgeStr ?? '').trim();
  if (!trimmed) return null;
  const m = /^([A-Z])->([A-Z])$/.exec(trimmed);
  if (!m) return null;
  if (m[1] === m[2]) return null;
  return { from: m[1], to: m[2], normalized: `${m[1]}->${m[2]}` };
}

function computeDepth(tree) {
  // tree: { [node]: subtreeObject }
  const dfs = (nodeObj) => {
    let best = 0;
    for (const k of Object.keys(nodeObj)) {
      const child = nodeObj[k] || {};
      const childDepth = dfs(child);
      best = Math.max(best, 1 + childDepth);
    }
    return best;
  };
  // depth is number of nodes on longest path starting at root
  // tree object is root mapping: { root: { ... } }
  const rootKeys = Object.keys(tree);
  if (rootKeys.length === 0) return 0;
  const root = rootKeys[0];
  const inner = tree[root] || {};
  // longest path nodes = 1 (root) + longest edges count from inner
  const longestEdges = dfs(inner);
  return 1 + longestEdges;
}

function buildComponent({ edgesByParentChild, adj, allNodes, rootCandidate }) {
  // Detect cycle using DFS coloring on directed graph
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const n of allNodes) color.set(n, WHITE);

  let hasCycle = false;

  const dfsCycle = (u) => {
    if (hasCycle) return;
    color.set(u, GRAY);
    for (const v of (adj.get(u) || [])) {
      if (!color.has(v)) continue;
      if (color.get(v) === GRAY) {
        hasCycle = true;
        return;
      }
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
    const root = start;
    return { root, tree: {}, has_cycle: true };
  }

  // Build tree deterministically using first-encountered parent for each child.
  // edgesByParentChild: Map child -> firstParent (string)
  // Also need tree structure from roots.
  // Determine root: given rootCandidate should be valid root (not a child). If none, pick lexicographically smallest.
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

  // Depth calculation: if root has empty subtree => depth 1.
  const depth = computeDepth(tree);
  return { root, tree: tree, depth };
}

app.post('/bfhl', (req, res) => {
  const body = req.body || {};
  const data = Array.isArray(body.data) ? body.data : null;

  if (!data) {
    return res.status(400).json({ error: 'Body must be JSON with field data: string[]' });
  }

  const user_id = 'jyotijuneja_24062026';
  const email_id = 'jyoti.juneja@chitkara.edu.in';
  const college_roll_number = '24BCS80073';

  const invalid_entries = [];
  const duplicate_edges = [];

  const seenEdge = new Set(); // normalized from->to to detect duplicates
  const firstParentForChild = new Map(); // child -> parent (first encountered edge that sets parent)

  // Adjacency list using all valid edges, but we will later discard multi-parent except first
  const adj = new Map();
  const allNodesSet = new Set();

  // For duplicate_edges: push once per subsequent occurrence, meaning only if edge repeats.
  // With set, track duplicatesSeen as well.
  const duplicatesPushed = new Set();

  const validEdges = []; // keep normalized edges in input order for component analysis

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

    // first-encountered parent edge for child wins
    if (!firstParentForChild.has(parsed.to)) {
      firstParentForChild.set(parsed.to, parsed.from);
    }
  }

  // Determine roots: nodes that never appear as a child (considering only valid, non-duplicate edges).
  const childrenSet = new Set(firstParentForChild.keys());
  const allNodes = [...allNodesSet];

  // Build weakly connected components based on directed edges (treat as undirected for grouping)
  const undAdj = new Map();
  for (const n of allNodes) undAdj.set(n, new Set());
  for (const { from, to } of validEdges) {
    undAdj.get(from).add(to);
    undAdj.get(to).add(from);
  }

  const visited = new Set();
  const hierarchies = [];
  let total_trees = 0;
  let total_cycles = 0;
  let largest_tree_root = null;
  let largest_depth = -1;

  for (const startNode of [...allNodes].sort()) {
    if (visited.has(startNode)) continue;

    // BFS component
    const queue = [startNode];
    visited.add(startNode);
    const componentNodes = new Set();
    while (queue.length) {
      const u = queue.shift();
      componentNodes.add(u);
      for (const v of undAdj.get(u) || []) {
        if (!visited.has(v)) {
          visited.add(v);
          queue.push(v);
        }
      }
    }

    // Root candidate for this group
    let rootCandidate = null;
    for (const n of [...componentNodes]) {
      if (!childrenSet.has(n)) {
        rootCandidate = n;
        break; // since we iterate sorted later below? We'll adjust.
      }
    }
    // We need lexicographically smallest root among non-children for determinism.
    if (rootCandidate === null) {
      // pure cycle: pick lexicographically smallest node as root
      rootCandidate = [...componentNodes].sort()[0];
    } else {
      rootCandidate = [...componentNodes]
        .filter((n) => !childrenSet.has(n))
        .sort()[0];
    }

    const componentAllNodes = [...componentNodes];

    const resObj = buildComponent({
      edgesByParentChild: firstParentForChild,
      adj,
      allNodes: componentAllNodes,
      rootCandidate: rootCandidate
    });

    // For non-cyclic trees, tree needs to be nested under root label (tree field is object, not array)
    if (resObj.has_cycle) {
      total_cycles += 1;
    } else {
      total_trees += 1;
      const depth = resObj.depth;
      const r = resObj.root;
      if (depth > largest_depth || (depth === largest_depth && r < largest_tree_root)) {
        largest_depth = depth;
        largest_tree_root = r;
      }
    }

    // Ensure tree is {} for cycles already.
    // Also resObj.tree already is {root: ...}. But spec expects tree: {} for cyclic.
    hierarchies.push(resObj);
  }

  // If no trees, largest_tree_root should still exist? Spec says root of tree with greatest depth.
  // We'll set null if none.
  const summary = {
    total_trees,
    total_cycles,
    largest_tree_root: largest_tree_root ?? ''
  };

  return res.json({
    user_id,
    email_id,
    college_roll_number,
    hierarchies,
    invalid_entries,
    duplicate_edges,
    summary
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

