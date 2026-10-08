import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/scheduler.js';
const p = (id, arrival, burst) => ({ id, arrival, burst });

test('all schedulers conserve CPU time and include initial idle periods', () => {
  for (const algorithm of ['fcfs', 'sjf', 'srtf', 'rr', 'hrrn', 'lrtf', 'mlfq']) {
    const input = [p('A', 3, 5), p('B', 5, 2)];
    const r = simulate(input, algorithm, 2);
    assert.deepEqual(r.timeline[0], { processId: 'IDLE', start: 0, end: 3 });
    for (const process of input) {
      const busy = r.timeline.filter(e => e.processId === process.id).reduce((s, e) => s + e.end - e.start, 0);
      assert.equal(busy, process.burst, algorithm);
      assert.equal(r.waiting[process.id], r.completion[process.id] - process.arrival - process.burst);
      assert.ok(r.waiting[process.id] >= 0);
    }
    for (let i = 1; i < r.timeline.length; i++) assert.equal(r.timeline[i].start, r.timeline[i-1].end);
  }
});

test('FCFS and SRTF have known completion and response times', () => {
  const input = [p('A', 0, 8), p('B', 1, 2)];
  assert.deepEqual(simulate(input, 'fcfs').completion, { A: 8, B: 10 });
  const r = simulate(input, 'srtf');
  assert.deepEqual(r.completion, { A: 10, B: 3 });
  assert.deepEqual(r.response, { A: 0, B: 0 });
});

test('MLFQ preempts its bottom queue immediately on a new arrival', () => {
  const r = simulate([p('A', 0, 3000), p('B', 10, 1)], 'mlfq', 2, 3);
  assert.deepEqual(r.timeline.slice(0, 4), [
    { processId: 'A', start: 0, end: 2, queueLevel: 0 },
    { processId: 'A', start: 2, end: 6, queueLevel: 1 },
    { processId: 'A', start: 6, end: 10, queueLevel: 2 },
    { processId: 'B', start: 10, end: 11, queueLevel: 0 },
  ]);
  assert.equal(r.completion.A, 3001);
  assert.equal(r.response.B, 0);
});

test('MLFQ retains an interrupted middle-queue allotment and position', () => {
  const r = simulate([p('A', 0, 12), p('B', 3, 1)], 'mlfq', 2, 3);
  assert.deepEqual(r.timeline.slice(0, 5), [
    { processId: 'A', start: 0, end: 2, queueLevel: 0 },
    { processId: 'A', start: 2, end: 3, queueLevel: 1 },
    { processId: 'B', start: 3, end: 4, queueLevel: 0 },
    { processId: 'A', start: 4, end: 7, queueLevel: 1 },
    { processId: 'A', start: 7, end: 13, queueLevel: 2 },
  ]);
});

test('one MLFQ level uses FCFS, and invalid quanta cannot hang RR', () => {
  const r = simulate([p('A', 0, 5), p('B', 1, 1)], 'mlfq', 2, 1);
  assert.equal(r.completion.B, 6);
  assert.throws(() => simulate([p('A', 0, 2)], 'rr', 0), RangeError);
  assert.deepEqual(simulate([], 'mlfq').timeline, []);
});

test('fractional bursts and duplicate process IDs are rejected before simulation can hang', () => {
  assert.throws(() => simulate([p('A', 0, 1.5)], 'srtf'), RangeError);
  assert.throws(() => simulate([p('A', 0, 1), p('A', 1, 2)], 'rr'), RangeError);
  assert.throws(() => simulate([p('A', Infinity, 2)], 'mlfq'), RangeError);
});

test('process names cannot overwrite metric prototypes or the idle marker', () => {
  const r = simulate([p('__proto__', 0, 2)], 'fcfs');
  assert.equal(r.completion.__proto__, 2);
  assert.equal(r.turnaround.__proto__, 2);
  assert.equal(r.avgTurnaround, 2);
  assert.throws(() => simulate([p('IDLE', 0, 2)], 'fcfs'), RangeError);
});
