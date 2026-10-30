const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLogBuffer } = require('./parser');

test('timestamps without timezone are normalized as UTC', () => {
  const { events } = parseLogBuffer('2026-10-29T09:00:03.464 INFO student=S1 status=200\n', 'sample.log');
  assert.equal(events[0].ts.toISOString(), '2026-10-29T09:00:03.464Z');
});
