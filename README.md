# SchedViz — CPU Scheduling Visualizer

An interactive, client-side visualizer for classic OS CPU scheduling algorithms. Build a set of processes, pick an algorithm, and step through the execution timeline event-by-event to see exactly how each scheduler makes its decisions — or compare every algorithm side-by-side on the same workload.

**Live demo:** https://dhruv-sharma29.github.io/SchedViz/

## Features

- **Editable process table** — add/remove processes and edit arrival time, CPU burst, I/O burst, and priority inline.
- **Seven scheduling algorithms:**
  - FCFS — First Come First Serve
  - SJF — Shortest Job First
  - SRTF — Shortest Remaining Time First (preemptive SJF)
  - Round Robin — with a configurable time quantum
  - HRRN — Highest Response Ratio Next
  - LRTF — Longest Remaining Time First
  - MLFQ — Multi-Level Feedback Queue, with configurable base quantum and number of levels (1–10)
- **Animated Gantt-chart timeline** with play/pause, step forward/back, a scrubber, and zoom.
- **Per-process metrics table** — start, completion, response, turnaround, and waiting time for every process, plus average waiting/turnaround and CPU utilization.
- **Compare view** — runs the current workload through all seven algorithms at once and charts average waiting/turnaround time so you can see the trade-offs.
- **Built-in presets**, including a 10-level MLFQ textbook example.
- Runs entirely in the browser — no backend, no data leaves your machine.

## Tech stack

- [React](https://react.dev/) (via [Vite](https://vitejs.dev/))
- [lucide-react](https://lucide.dev/) for icons
- Plain CSS — no UI framework

## Getting started

```bash
git clone https://github.com/Dhruv-Sharma29/SchedViz.git
cd SchedViz
npm install
npm run dev
```

This starts a local Vite dev server (prints the URL, typically `http://localhost:5173`).

### Build

```bash
npm run build
```

Outputs a static production build to `dist/`, base-pathed to `/SchedViz/` for GitHub Pages deployment.

### Preview the production build

```bash
npm run preview
```

## Usage

1. Edit the process set on the left (or use the default preset), setting arrival time, CPU burst, I/O burst, and priority for each process.
2. Choose a scheduling algorithm from the dropdown. Round Robin and MLFQ expose extra controls for time quantum and (for MLFQ) the number of queue levels.
3. Use the playback controls under the Gantt chart to step through the schedule one event at a time, play it automatically, or scrub to any point.
4. Check the metrics table for per-process and average statistics.
5. Switch to the **Compare** tab to see how all seven algorithms perform on the same workload.

## Project structure

```
.
├── index.html          # App shell
├── src/
│   ├── main.jsx         # App component, scheduling simulation logic, and UI
│   └── styles.css        # Styling
├── vite.config.js       # Vite config (base path set for GitHub Pages)
└── package.json
```

## License

MIT © Dhruv Sharma

## Scheduling model and tests

Each process has one CPU burst and an arrival time. Priority and I/O columns have been removed because this model does not schedule I/O or user-defined priorities. MLFQ assigns new jobs to the highest queue, uses exponentially increasing round-robin allotments, and runs the bottom queue as FCFS. Higher-priority arrivals preempt lower queues immediately; interrupted jobs retain their remaining allotment and queue position. There is no periodic priority boost.

Run `npm test` for scheduling regression tests and `npm run build` for the production build.
