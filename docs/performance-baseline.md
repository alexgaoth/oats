# Performance baseline

`TODO.md` P0.2: _"A subjective lag report must become a reproducible performance
budget."_ This is the procedure, the instrument, and the numbers so far.

## Running it

```sh
npm run perf:baseline                            # print a table
npm run perf:baseline -- --json fedora-2026-08-19  # also write docs/perf/<name>.json
```

`scripts/perf-baseline.js` launches an isolated Oats on the **staging** channel,
so it gets its own `userData` directory and its own single-instance lock and a
development Oats can stay open beside it. It drives the three surfaces over the
Chrome DevTools Protocol and reports:

| Metric                      | What it is                                                  |
| --------------------------- | ----------------------------------------------------------- |
| cold launch → interactive   | process spawn until the three destinations can be clicked   |
| warm reload → interactive   | the same after the renderer is warm                         |
| surface switch p50 / p95    | click → React commit → paint, `REPEATS` samples per surface |
| settings first open         | the first switch to Settings specifically                   |
| advanced first open         | click "Advanced" → legacy settings on screen (lazy chunk)   |
| idle CPU / RSS, per surface | whole process tree, `/proc`, over `OATS_PERF_IDLE_MS`       |

Environment overrides: `OATS_PERF_PORT`, `OATS_PERF_IDLE_MS`, `OATS_PERF_REPEATS`.

**Idle CPU is reported per surface on purpose.** It is the number P0.1 exists to
move, and a single whole-app figure hides it completely.

### If it cannot find the debugger

Two Linux-specific traps, both already handled but worth knowing:

- On Wayland `main.js` re-executes itself with `--ozone-platform=x11`. The first
  process has already bound the debug port, and the replacement loses the race
  to rebind it — Chromium then disables remote debugging silently. The script
  passes the flag up front so only one process ever binds.
- A killed instance can leave a `pactl subscribe` child behind (the Linux
  microphone-activity detector). It **inherits the listening socket**, so the
  port still accepts connections and never answers. `ss -ltnp | grep <port>`
  names the holder; kill it.

## Results

### Fedora 44, GNOME/Wayland (XWayland), Intel ARL — 2026-08-19

Raw JSON: `docs/perf/fedora-2026-08-19.json`.

| Metric                            | Value          |
| --------------------------------- | -------------- |
| cold launch → interactive         | 2613 ms        |
| warm reload → interactive         | 9 ms           |
| switch → conversation (p50 / p95) | 28.8 / 32.1 ms |
| switch → intelligence (p50 / p95) | 26.5 / 29.5 ms |
| switch → settings (p50 / p95)     | 12.6 / 15.0 ms |
| settings first open               | 15 ms          |
| advanced first open (lazy chunk)  | 362 ms         |
| idle CPU — conversation           | 17.1 %         |
| idle CPU — intelligence           | 18.1 %         |
| idle CPU — settings               | 16.7 %         |
| idle RSS (whole tree)             | ~1.03 GB       |

**What this measurement found.** Before the P0.1 field work, idling on the
Conversation surface with **no conversation running** cost **113.1 % of a core**.
The wheat was absent and the sky was static, and the renderer was still drawing
the identical frame sixty times a second — with `--disable-gpu-compositing` on
Linux, every one of those frames is read back on the CPU. Freezing the field off
the Conversation surface, and letting it come to rest on the Conversation
surface once the wheat has withdrawn, took that to **17.1 %** — level with the
other two surfaces, which is the correct shape: idle cost should not depend on
which page is open.

The residual ~17 % is the application floor (Electron plus the Qdrant and model
sidecars), not the field. It and the ~1 GB resident set are the next things
worth attacking, and neither is a rendering problem.

## Still manual

These need hardware, a microphone, and real speech, and no script substitutes
for them. Record them here alongside the table above.

- **Apple Silicon.** Every row of the table, on a notarized build.
- **Occluded idle.** The control panel sets `backgroundThrottling: false`, so
  Chromium will not pause work behind another window. Cover the window with
  another application and sample CPU for a minute; it should not exceed the
  foreground figure.
- **Active recording.** CPU, GPU and memory while recording, with the field
  live, question detection running, and local transcription decoding.
- **A realistic 60-minute conversation.** Local transcription, question-card,
  and graph cost over the full hour — and the memory curve, which is the one
  that decides whether a long conversation survives.
- **Upstream comparison.** The same rows against the OpenWhispr baseline where
  a comparable surface exists.
