import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAiVerdict } from './aiVerdict.js';

const sampleReport = `# Incident report: degraded_ai

## Incident 1: 03:31 to 03:48 (18 min)

**Most likely root cause: \`memory_exhaustion\`** (model confidence 45%)

Other possibilities: bandwidth_cap 39%, cpu_saturation 8%
`;

test('extractAiVerdict returns the primary cause and confidence', () => {
  const verdict = extractAiVerdict(sampleReport);
  assert.equal(verdict.cause, 'memory_exhaustion');
  assert.equal(verdict.confidence, 45);
  assert.ok(verdict.heading.includes('03:31'));
});

test('extractAiVerdict handles reports without markdown emphasis', () => {
  const verdict = extractAiVerdict('Most likely root cause: bandwidth_cap (model confidence 80%)');
  assert.equal(verdict.cause, 'bandwidth_cap');
  assert.equal(verdict.confidence, 80);
});
