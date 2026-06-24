const http = require('http');

const port = 3000;

function post(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ data });
    const req = http.request(
      { hostname: 'localhost', port, path: '/bfhl', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let d = '';
        res.on('data', (c) => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Test 1: Example from spec
  const r1 = await post(['A->B','A->C','B->D','C->E','E->F','X->Y','Y->Z','Z->X','P->Q','Q->R','G->H','G->H','G->I','hello','1->2','A->']);
  console.log('Test 1 - Example:');
  console.log('  trees:', r1.summary.total_trees, 'cycles:', r1.summary.total_cycles, 'largest:', r1.summary.largest_tree_root);
  console.log('  invalid:', JSON.stringify(r1.invalid_entries));
  console.log('  duplicates:', JSON.stringify(r1.duplicate_edges));
  console.assert(r1.summary.total_trees === 3, 'Expected 3 trees');
  console.assert(r1.summary.total_cycles === 1, 'Expected 1 cycle');
  console.assert(r1.summary.largest_tree_root === 'A', 'Expected largest root A');
  console.assert(r1.duplicate_edges[0] === 'G->H', 'Expected duplicate G->H');

  // Test 2: Self-loop
  const r2 = await post(['A->B', 'A->A', 'B->C', 'B->B', 'X->Y']);
  console.log('Test 2 - Self-loop:');
  console.log('  invalid:', JSON.stringify(r2.invalid_entries));
  console.assert(r2.invalid_entries.includes('A->A'), 'A->A should be invalid');
  console.assert(r2.invalid_entries.includes('B->B'), 'B->B should be invalid');
  console.assert(!r2.invalid_entries.includes('A->B'), 'A->B should be valid');

  // Test 3: Pure cycle
  const r3 = await post(['A->B', 'B->C', 'C->A']);
  console.log('Test 3 - Pure cycle:');
  console.log('  has_cycle:', r3.hierarchies[0].has_cycle);
  console.assert(r3.hierarchies[0].has_cycle === true, 'Should have cycle');
  console.assert(JSON.stringify(r3.hierarchies[0].tree) === '{}', 'Tree should be {}');

  // Test 4: Multi-parent (diamond)
  const r4 = await post(['A->D', 'B->D', 'A->B']);
  console.log('Test 4 - Multi-parent:');
  console.log('  root:', r4.hierarchies[0].root, 'depth:', r4.hierarchies[0].depth, 'tree:', JSON.stringify(r4.hierarchies[0].tree));
  console.assert(r4.hierarchies.length === 1, 'Should have 1 hierarchy');
  // A->D first, B->D second so D stays under A. A->B is valid.
  // Expected: { A: { B: {}, D: {} } } depth 2

  // Test 5: Triple duplicate
  const r5 = await post(['A->B', 'A->B', 'A->B']);
  console.log('Test 5 - Triple duplicate:');
  console.log('  duplicates:', JSON.stringify(r5.duplicate_edges));
  console.assert(r5.duplicate_edges.length === 1, 'Should have 1 duplicate');
  console.assert(r5.duplicate_edges[0] === 'A->B', 'Should be A->B');

  // Test 6: Empty
  const r6 = await post([]);
  console.log('Test 6 - Empty:');
  console.log('  trees:', r6.summary.total_trees, 'hierarchies:', r6.hierarchies.length);

  // Test 7: Invalid entries
  const r7 = await post(['hello', '1->2', 'A->', '', ' A->B ']);
  console.log('Test 7 - Invalid:');
  console.log('  invalid:', JSON.stringify(r7.invalid_entries));
  // ' A->B ' should be trimmed to 'A->B' which is valid, so not in invalid
  console.assert(r7.invalid_entries.length === 4, 'Should have 4 invalid entries');
  console.assert(r7.hierarchies.length === 1, 'Should have 1 hierarchy (A->B)');

  // Test 8: Single node
  const r8 = await post(['A->B']);
  console.log('Test 8 - Single edge:');
  console.log('  depth:', r8.hierarchies[0].depth);
  console.assert(r8.hierarchies[0].depth === 2, 'Depth should be 2');

  console.log('\nAll tests passed!');
}

main().catch(console.error);
