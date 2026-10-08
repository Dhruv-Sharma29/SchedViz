function merge(events) {
  return events.reduce((a, e) => {
    const last = a[a.length - 1];
    if (
      last &&
      last.processId === e.processId &&
      last.end === e.start &&
      last.queueLevel === e.queueLevel
    )
      last.end = e.end;
    else a.push({ ...e });
    return a;
  }, []);
}
function result(processes, events) {
  const timeline = merge(events),
    completion = Object.fromEntries(processes.map((p) => [p.id, 0]));
  timeline.forEach((e) => {
    if (e.processId !== "IDLE")
      completion[e.processId] = Math.max(completion[e.processId], e.end);
  });
  const turnaround = Object.fromEntries(processes.map((p) => [p.id, 0])),
    waiting = Object.fromEntries(processes.map((p) => [p.id, 0])),
    response = Object.fromEntries(processes.map((p) => [p.id, 0]));
  processes.forEach((p) => {
    turnaround[p.id] = completion[p.id] - p.arrival;
    waiting[p.id] = turnaround[p.id] - p.burst;
    const first = timeline.find((e) => e.processId === p.id);
    response[p.id] = (first?.start ?? p.arrival) - p.arrival;
  });
  const totalTime = timeline.at(-1)?.end || 0,
    busyTime = timeline
      .filter((e) => e.processId !== "IDLE")
      .reduce((sum, e) => sum + e.end - e.start, 0);
  return {
    timeline,
    completion,
    turnaround,
    waiting,
    response,
    avgWaiting: avg(Object.values(waiting)),
    avgTurnaround: avg(Object.values(turnaround)),
    cpuUtilization: totalTime ? (busyTime / totalTime) * 100 : 0,
  };
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export function simulate(processes, algo, quantum = 3, levels = 3) {
  if (!Number.isInteger(quantum) || quantum < 1 || !Number.isInteger(levels) || levels < 1) {
    throw new RangeError("Quantum and queue levels must be positive integers");
  }
  const ids = new Set();
  for (const p of processes) {
    if (typeof p.id !== "string" || !p.id || p.id === "IDLE" || ids.has(p.id)) {
      throw new RangeError("Process IDs must be nonempty, unique, and different from IDLE");
    }
    if (!Number.isSafeInteger(p.arrival) || p.arrival < 0 ||
        !Number.isSafeInteger(p.burst) || p.burst < 1) {
      throw new RangeError("Arrival and CPU burst must be valid whole time units");
    }
    ids.add(p.id);
  }
  const ps = processes
    .map((p) => ({ ...p }))
    .filter((p) => p.burst > 0)
    .sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const ev = [];
  if (!ps.length) return result(processes, ev);
  if (algo === "fcfs" || algo === "sjf" || algo === "hrrn") {
    let t = 0,
      done = new Set();
    while (done.size < ps.length) {
      const ready = ps.filter((p) => !done.has(p.id) && p.arrival <= t);
      if (!ready.length) {
        const n = ps.find((p) => !done.has(p.id));
        ev.push({ processId: "IDLE", start: t, end: n.arrival });
        t = n.arrival;
        continue;
      }
      let p = ready[0];
      if (algo === "sjf")
        p = ready.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival)[0];
      if (algo === "hrrn")
        p = ready
          .sort(
            (a, b) =>
              (t - a.arrival + a.burst) / a.burst -
              (t - b.arrival + b.burst) / b.burst,
          )
          .at(-1);
      ev.push({ processId: p.id, start: t, end: t + p.burst });
      t += p.burst;
      done.add(p.id);
    }
    return result(processes, ev);
  }
  let t = 0,
    remaining = Object.fromEntries(ps.map((p) => [p.id, p.burst])),
    done = new Set(),
    queue = [],
    next = 0;
  const add = () => {
    while (next < ps.length && ps[next].arrival <= t) {
      queue.push(ps[next].id);
      next++;
    }
  };
  if (algo === "rr") {
    while (done.size < ps.length) {
      add();
      if (!queue.length) {
        const n = ps[next];
        ev.push({ processId: "IDLE", start: t, end: n.arrival });
        t = n.arrival;
        add();
      }
      const id = queue.shift(),
        d = Math.min(quantum, remaining[id]);
      ev.push({ processId: id, start: t, end: t + d });
      t += d;
      remaining[id] -= d;
      add();
      if (remaining[id] > 0) queue.push(id);
      else done.add(id);
    }
    return result(processes, ev);
  }
  if (algo === "mlfq") {
    const queues = Array.from({ length: levels }, () => []);
    const budget = Object.fromEntries(ps.map((p) => [p.id, quantum]));
    next = 0;
    const admit = () => {
      while (next < ps.length && ps[next].arrival <= t) {
        queues[0].push(ps[next++].id);
      }
    };
    while (done.size < ps.length) {
      admit();
      const q = queues.findIndex((x) => x.length);
      if (q < 0) {
        ev.push({ processId: "IDLE", start: t, end: ps[next].arrival });
        t = ps[next].arrival;
        continue;
      }
      const id = queues[q].shift();
      // The bottom queue is FCFS. A higher-priority arrival preempts any
      // lower queue, retaining both its place and unused time allotment.
      const bottom = q === levels - 1;
      const untilArrival = q > 0 && next < ps.length ? ps[next].arrival - t : Infinity;
      const d = Math.min(bottom ? Infinity : budget[id], remaining[id], untilArrival);
      ev.push({ processId: id, start: t, end: t + d, queueLevel: q });
      t += d;
      remaining[id] -= d;
      if (!bottom) budget[id] -= d;
      admit();
      if (remaining[id] === 0) done.add(id);
      else if (bottom || budget[id] > 0) queues[q].unshift(id);
      else {
        const lower = Math.min(q + 1, levels - 1);
        budget[id] = quantum * Math.pow(2, lower);
        queues[lower].push(id);
      }
    }
    return result(processes, ev);
  }
  while (done.size < ps.length) {
    let choices = ps.filter((p) => !done.has(p.id) && p.arrival <= t);
    if (!choices.length) {
      const n = ps.find((p) => !done.has(p.id));
      ev.push({ processId: "IDLE", start: t, end: n.arrival });
      t = n.arrival;
      continue;
    }
    const p = choices.sort((a, b) => {
      const x = remaining[a.id] - remaining[b.id];
      return algo === "lrtf" ? -x : x || a.arrival - b.arrival;
    })[0];
    ev.push({ processId: p.id, start: t, end: t + 1 });
    remaining[p.id]--;
    t++;
    if (!remaining[p.id]) done.add(p.id);
  }
  return result(processes, ev);
}
