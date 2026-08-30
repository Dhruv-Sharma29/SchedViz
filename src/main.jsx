import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Plus,
  Trash2,
  ChevronDown,
  Info,
  GitCompareArrows,
} from "lucide-react";
import "./styles.css";

const COLORS = [
  "#7c6df2",
  "#ef786f",
  "#39b98d",
  "#e6aa4d",
  "#4da3e6",
  "#d86da6",
  "#8bbd54",
  "#a28ad9",
];
const processColor = (id) => {
  const number = Number(String(id).replace(/\D/g, ""));
  return COLORS[(Number.isFinite(number) ? number : 0) % COLORS.length];
};
const PRESET = [
  { id: "P1", arrival: 0, burst: 8, ioBurst: 0, priority: 2 },
  { id: "P2", arrival: 1, burst: 4, ioBurst: 0, priority: 1 },
  { id: "P3", arrival: 2, burst: 2, ioBurst: 0, priority: 3 },
  { id: "P4", arrival: 3, burst: 5, ioBurst: 0, priority: 2 },
  { id: "P5", arrival: 5, burst: 3, ioBurst: 0, priority: 1 },
];
const MLFQ_TEXTBOOK_PRESET = Array.from({ length: 10 }, (_, i) => ({
  id: `P${i}`,
  arrival: 0,
  burst: 1000,
  ioBurst: 0,
  priority: 1,
}));
const ALGORITHMS = [
  ["fcfs", "FCFS", "First Come First Serve"],
  ["sjf", "SJF", "Shortest Job First"],
  ["srtf", "SRTF", "Shortest Remaining Time"],
  ["rr", "Round Robin", "Configurable time quantum"],
  ["hrrn", "HRRN", "Highest Response Ratio Next"],
  ["lrtf", "LRTF", "Longest Remaining Time First"],
  ["mlfq", "MLFQ", "Multi-Level Feedback Queue"],
];

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
    completion = {};
  processes.forEach((p) => (completion[p.id] = 0));
  timeline.forEach((e) => {
    if (e.processId !== "IDLE")
      completion[e.processId] = Math.max(completion[e.processId], e.end);
  });
  const turnaround = {},
    waiting = {},
    response = {};
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
function simulate(processes, algo, quantum = 3, levels = 3) {
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
    let queues = Array.from({ length: levels }, () => []),
      level = {};
    ps.forEach((p) => (level[p.id] = 0));
    next = 0;
    while (done.size < ps.length) {
      while (next < ps.length && ps[next].arrival <= t) {
        queues[0].push(ps[next].id);
        next++;
      }
      let q = queues.findIndex((x) => x.length);
      if (q < 0) {
        const n = ps[next];
        ev.push({ processId: "IDLE", start: t, end: n.arrival });
        t = n.arrival;
        continue;
      }
      const id = queues[q].shift(),
        d = Math.min(
          q === levels - 1 ? 999 : quantum * Math.pow(2, q),
          remaining[id],
        );
      ev.push({ processId: id, start: t, end: t + d, queueLevel: q });
      t += d;
      remaining[id] -= d;
      while (next < ps.length && ps[next].arrival <= t) {
        queues[0].push(ps[next].id);
        next++;
      }
      if (remaining[id]) queues[Math.min(q + 1, levels - 1)].push(id);
      else done.add(id);
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
function App() {
  const [processes, setProcesses] = useState(PRESET),
    [algo, setAlgo] = useState("srtf"),
    [quantum, setQuantum] = useState(3),
    [mlfqLevels, setMlfqLevels] = useState(3),
    [chartZoom, setChartZoom] = useState(1),
    [active, setActive] = useState(0),
    [playing, setPlaying] = useState(false),
    [view, setView] = useState("visualize");
  const sim = useMemo(
    () => simulate(processes, algo, quantum, mlfqLevels),
    [processes, algo, quantum, mlfqLevels],
  );
  const visible = sim.timeline.slice(0, active || sim.timeline.length);
  const total = sim.timeline.at(-1)?.end || 1;
  const activeEvent = visible.at(-1);
  React.useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () =>
        setActive((x) => {
          if (x >= sim.timeline.length) {
            setPlaying(false);
            return x;
          }
          return x + 1;
        }),
      650,
    );
    return () => clearInterval(id);
  }, [playing, sim.timeline.length]);
  const update = (i, key, val) =>
    setProcesses((a) =>
      a.map((p, j) =>
        j === i
          ? {
              ...p,
              [key]:
                key === "id"
                  ? val
                  : Math.max(0, Number(String(val).replace(/^0+(?=\d)/, "")) || 0),
            }
          : p,
      ),
    );
  const add = () =>
    setProcesses((a) => [
      ...a,
      { id: `P${a.length + 1}`, arrival: 0, burst: 3, ioBurst: 0, priority: 1 },
    ]);
  const reset = () => {
    setActive(0);
    setPlaying(false);
    setChartZoom(1);
  };
  const loadMlfqExample = () => {
    setProcesses(MLFQ_TEXTBOOK_PRESET);
    setAlgo("mlfq");
    setMlfqLevels(10);
    setQuantum(2);
    reset();
  };
  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo">▦</div>
          <div>
            <div className="brand-name">SchedViz</div>
            <div className="brand-sub">OS CPU Scheduling Visualizer</div>
          </div>
        </div>
        <nav>
          <button
            className={view === "visualize" ? "nav-active" : ""}
            onClick={() => setView("visualize")}
          >
            Visualizer
          </button>
          <button
            className={view === "compare" ? "nav-active" : ""}
            onClick={() => setView("compare")}
          >
            <GitCompareArrows size={15} /> Compare
          </button>
        </nav>
        <div className="header-right">
          <span className="status-dot" /> Client-side simulation
        </div>
      </header>
      <main>
        <div className="eyebrow">OPERATING SYSTEMS / SCHEDULING LAB</div>
        <div className="title-row">
          <div>
            <h1>
              {view === "compare"
                ? "Compare algorithms"
                : "CPU Scheduling Visualizer"}
            </h1>
            <p>
              {view === "compare"
                ? "Run the same workload through every algorithm and compare the trade-offs."
                : "Explore how different scheduling algorithms make decisions, one time slice at a time."}
            </p>
          </div>
          <button
            className="ghost"
            onClick={() => {
              setProcesses(PRESET);
              reset();
            }}
          >
            <RotateCcw size={15} /> Reset example
          </button>
        </div>
        {view === "compare" ? (
          <Compare processes={processes} quantum={quantum} />
        ) : (
          <>
            <section className="workspace">
              <aside className="panel input-panel">
                <div className="panel-head">
                  <div>
                    <h2>Process set</h2>
                    <span>{processes.length} processes</span>
                  </div>
                  <button className="icon-btn" onClick={add}>
                    <Plus size={17} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>PID</th>
                        <th>ARRIVAL</th>
                        <th>CPU BURST</th>
                        <th>I/O BURST</th>
                        <th>PRIORITY</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {processes.map((p, i) => (
                        <tr key={i}>
                          <td>
                            <input
                              value={p.id}
                              onChange={(e) => update(i, "id", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={p.arrival}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                update(i, "arrival", e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={p.burst}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                update(i, "burst", e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={p.ioBurst || 0}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                update(i, "ioBurst", e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={p.priority}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                update(i, "priority", e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="delete"
                              onClick={() =>
                                setProcesses((a) => a.filter((_, j) => j !== i))
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="add-process" onClick={add}>
                  <Plus size={15} /> Add process
                </button>
                <button className="example-process" onClick={loadMlfqExample}>
                  Load 10-level MLFQ example
                </button>
                <div className="hint">
                  <Info size={15} />
                  <span>
                    I/O burst is tracked in the metrics table; the CPU schedule
                    uses CPU burst time.
                  </span>
                </div>
              </aside>
              <section className="panel main-panel">
                <div className="algorithm-bar">
                  <div className="select-label">
                    ALGORITHM <ChevronDown size={14} />
                  </div>
                  <select
                    value={algo}
                    onChange={(e) => {
                      setAlgo(e.target.value);
                      reset();
                    }}
                  >
                    {ALGORITHMS.map((a) => (
                      <option value={a[0]} key={a[0]}>
                        {a[1]} — {a[2]}
                      </option>
                    ))}
                  </select>
                  {(algo === "rr" || algo === "mlfq") && (
                    <label className="quantum">
                      {algo === "mlfq" ? "Base quantum (level 1)" : "Time quantum"}{" "}
                      <input
                        type="number"
                        min="1"
                        value={quantum}
                        onChange={(e) =>
                          setQuantum(Math.max(1, Number(e.target.value)))
                        }
                      />
                    </label>
                  )}
                  {algo === "mlfq" && (
                    <label className="quantum">
                      Levels (1–10){" "}
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={mlfqLevels}
                        onChange={(e) =>
                          setMlfqLevels(
                            Math.min(10, Math.max(1, Number(e.target.value))),
                          )
                        }
                      />
                    </label>
                  )}
                </div>
                <div className="algo-desc">
                  <span className="algo-pill">
                    {ALGORITHMS.find((a) => a[0] === algo)[1]}
                  </span>
                  {ALGORITHMS.find((a) => a[0] === algo)[2]}{" "}
                  <span className="muted">
                    · {sim.timeline.length} scheduling events
                  </span>
                </div>
                <Gantt
                  events={visible}
                  total={total}
                  allEvents={sim.timeline}
                  zoom={chartZoom}
                  onZoomChange={setChartZoom}
                />
                <div className="controls">
                  <button
                    onClick={() => {
                      setActive(0);
                      setPlaying(false);
                    }}
                  >
                    <SkipBack size={16} />
                  </button>
                  <button
                    className="play"
                    onClick={() => {
                      if (active >= sim.timeline.length) setActive(0);
                      setPlaying((x) => !x);
                    }}
                  >
                    {playing ? (
                      <Pause size={17} />
                    ) : (
                      <Play size={17} fill="currentColor" />
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setActive((x) => Math.min(sim.timeline.length, x + 1))
                    }
                  >
                    <SkipForward size={16} />
                  </button>
                  <span className="progress">
                    {active || sim.timeline.length} / {sim.timeline.length}{" "}
                    events
                  </span>
                  <input
                    className="scrub"
                    type="range"
                    min="0"
                    max={sim.timeline.length}
                    value={active || sim.timeline.length}
                    onChange={(e) => {
                      setPlaying(false);
                      setActive(Number(e.target.value));
                    }}
                  />
                </div>
              </section>
            </section>
            <Metrics processes={processes} sim={sim} />
          </>
        )}
      </main>
      <footer>
        <span>SchedViz v0.1</span>
        <span>Built for understanding, not just calculating.</span>
      </footer>
    </div>
  );
}
function Gantt({ events, total, allEvents, zoom, onZoomChange }) {
  const ticks = [...new Set([0, ...allEvents.map((e) => e.end), total])].sort(
    (a, b) => a - b,
  );
  return (
    <div className="gantt-section">
      <div className="gantt-title">
        <h2>Execution timeline</h2>
        <div className="chart-tools">
          <span>Hover a block for details</span>
          <button onClick={() => onZoomChange(Math.max(0.5, zoom - 0.5))}>−</button>
          <b>{zoom}×</b>
          <button onClick={() => onZoomChange(Math.min(4, zoom + 0.5))}>+</button>
        </div>
      </div>
      <div className="timeline-scroll">
      <div className="gantt" style={{ minWidth: `${Math.max(900, total * 1.2 * zoom)}px` }}>
        <div className="blocks">
          {events.map((e, i) => (
            <div
              key={i}
              className={"block " + (e.processId === "IDLE" ? "idle" : "")}
              style={{
                left: `${(e.start / total) * 100}%`,
                width: `${((e.end - e.start) / total) * 100}%`,
                background:
                  e.processId === "IDLE"
                    ? "#e9e8ee"
                    : processColor(e.processId),
              }}
              title={`${e.processId}: ${e.start} → ${e.end}`}
            >
              {((e.end - e.start) / total) * 100 >= 3.5 && (
                <>
                  <b>{e.processId}</b>
                  <small>{e.end - e.start}u</small>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="axis">
          {ticks.map((x) => (
            <span key={x} style={{ left: `${(x / total) * 100}%` }}>
              {x.toLocaleString()}
            </span>
          ))}
        </div>
      </div>
      </div>
      <div className="legend">
        {[
          ...new Set(
            allEvents.map((e) => e.processId).filter((x) => x !== "IDLE"),
          ),
        ].map((id, i) => (
          <span key={id}>
            <i
              style={{
                background: processColor(id),
              }}
            />
            {id}
          </span>
        ))}
      </div>
    </div>
  );
}
function Metrics({ processes, sim }) {
  return (
    <section className="panel metrics">
      <div className="panel-head">
        <div>
          <h2>Performance metrics</h2>
          <span>Calculated from completed schedule</span>
        </div>
        <div className="averages">
          <div>
            <b>{sim.avgWaiting.toFixed(2)}</b>
            <small>AVG WAITING</small>
          </div>
          <div>
            <b>{sim.avgTurnaround.toFixed(2)}</b>
            <small>AVG TURNAROUND</small>
          </div>
          <div>
            <b>{sim.cpuUtilization.toFixed(1)}%</b>
            <small>CPU UTILIZATION</small>
          </div>
        </div>
      </div>
      <div className="metrics-scroll">
        <table>
          <thead>
            <tr>
              <th>PROCESS</th>
              <th>BURST TIME</th>
              <th>ARRIVAL TIME</th>
              <th>I/O BURST TIME</th>
              <th>START TIME</th>
              <th>COMPLETION TIME</th>
              <th>RESPONSE TIME</th>
              <th>TURNAROUND TIME</th>
              <th>TOTAL BURST TIME</th>
              <th>WAITING TIME</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((p) => {
              const first = sim.timeline.find((e) => e.processId === p.id);
              const io = p.ioBurst || 0;
              return (
                <tr key={p.id}>
                  <td>
                    <span
                      className="pid-dot"
                      style={{ background: processColor(p.id) }}
                    />
                    {p.id}
                  </td>
                  <td>{p.burst}</td>
                  <td>{p.arrival}</td>
                  <td>{io}</td>
                  <td>{first?.start ?? 0}</td>
                  <td>{sim.completion[p.id] || 0}</td>
                  <td>{sim.response[p.id] || 0}</td>
                  <td>{sim.turnaround[p.id] || 0}</td>
                  <td>{p.burst + io}</td>
                  <td className={(sim.waiting[p.id] || 0) > 4 ? "warn" : ""}>
                    {sim.waiting[p.id] || 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Compare({ processes, quantum }) {
  const rows = ALGORITHMS.map((a) => {
    const s = simulate(processes, a[0], quantum);
    return { name: a[1], id: a[0], wait: s.avgWaiting, turn: s.avgTurnaround };
  });
  const max = Math.max(...rows.map((x) => x.wait), 1);
  return (
    <section className="panel compare">
      <div className="compare-head">
        <h2>Algorithm trade-offs</h2>
        <p>
          Average time across the current {processes.length}-process workload.
        </p>
      </div>
      <div className="compare-grid">
        {rows.map((r) => (
          <div className="compare-row" key={r.id}>
            <div className="compare-name">
              {r.name}
              <small>{ALGORITHMS.find((a) => a[0] === r.id)[2]}</small>
            </div>
            <div className="bar-area">
              <div className="bar">
                <span style={{ width: `${(r.wait / max) * 100}%` }} />
              </div>
              <b>{r.wait.toFixed(2)}</b>
              <small>avg waiting</small>
            </div>
            <div className="turn">
              <b>{r.turn.toFixed(2)}</b>
              <small>avg turnaround</small>
            </div>
          </div>
        ))}
      </div>
      <div className="hint">
        <Info size={15} />
        <span>
          Lower waiting and turnaround times are generally better, but the best
          choice depends on fairness and responsiveness.
        </span>
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);
