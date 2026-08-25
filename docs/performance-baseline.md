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
  microphone-activity detector), and that child holds an **inherited copy of the
  debug port's listening socket** — so the port accepts connections and never
  answers. Measured on 2026-08-24: `/proc/<pactl>/fd/63 -> socket:[8511221]`, the
  same inode `ss -ltnp` reports LISTENing on the port, with the pactl reparented
  to init. `spawn`'s `stdio: ["ignore", "pipe", "pipe"]` governs only fds 0–2;
  Chromium's listening socket is not one of Node's descriptors and is not
  CLOEXEC. Reaping cannot fix this on its own: Chromium binds the port before any
  application code runs, so `reapStaleSidecars()` is far too late. The script
  therefore clears the port itself before launching (`freePort`), and says so:

  ```
  [perf] pid 2084292 still holds port 9455; killing it
  ```

  An earlier version of this document said the child "inherits the listening
  socket"; a pass on 2026-08-24 removed that as measured-false, and this pass put
  it back, because it is true and there is now an inode to prove it.

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

That conclusion had a second half, and the second half was wrong. It said the
residual ~17 % was "the application floor (Electron plus the Qdrant and model
sidecars), not the field", and that neither it nor the ~1 GB resident set was a
rendering problem. Both halves are corrected below.

### Fedora 44, GNOME/Wayland (XWayland), Intel ARL — 2026-08-24

Raw JSON: `docs/perf/fedora-2026-08-24.json` (as shipped) and
`docs/perf/fedora-2026-08-24-prefix.json` (the same tree with only the fix
below reverted). Every number here is from one of those two runs.

| Metric                    | 2026-08-19 (recorded) | 2026-08-24 before | 2026-08-24 after |
| ------------------------- | --------------------- | ----------------- | ---------------- |
| cold launch → interactive | 2613 ms               | 1369 ms           | 1264 ms          |
| idle CPU — conversation   | 17.1 %                | 6.1 %             | **0.4 %**        |
| idle CPU — intelligence   | 18.1 %                | 7.5 %             | **1.6 %**        |
| idle CPU — settings       | 16.7 %                | 6.1 %             | **0.7 %**        |
| idle memory — PSS         | not measured          | 752 MB            | 746 MB           |
| idle memory — summed RSS  | ~1.03 GB              | 1266 MB           | 1272 MB          |

**The idle CPU was one CSS animation on a 96-pixel window.**
`.oats-listening-pulse::before` carries `animation: oats-breathe … infinite`, and
`src/App.jsx` — the inherited dictation panel, not the Oats `ListeningPulse`
component — put that class in its **base** class list. So the floating oat
breathed in every state, `idle` and `hover` included. It is always on top and
almost always idle, `--disable-gpu-compositing` is on for Linux, and every frame
of that breath is read back on the CPU. The per-process attribution says it
plainly — before, on the Conversation surface:

```
    3.3%   GPU
    2.4%   renderer index.html          (the floating oat)
    0.2%   browser
    0.1%   renderer index.html?panel=true  (the surface being measured)
```

5.7 of the 6.1 points, in a window you are not looking at. After the fix the same
two rows are 0.0 % and 0.1 %.

It was also a lie in the interface. `DESIGN.md` §9.1 is explicit — the seed
breathes _while a session is live_, and "**Idle = static gold seed**" — because
the difference between listening and not listening is the one thing this window
exists to say. `ListeningPulse.tsx` implements exactly that with
`state !== "live" && "before:hidden"`; the inherited panel never did.

`processing` deliberately keeps the breath. Motion is the only positive sign this
window has that work is happening — idle and processing are otherwise one opacity
step apart — and it is bounded by the transcription, so it is not an idle cost,
which is the whole of the argument above.

**What about the 17.1 %?** It does not reproduce on its own commit. `933f7cb` —
the tree the 2026-08-19 row was recorded from — was checked out into a separate
worktree, built, given the same `resources/bin` sidecars, and driven by this same
instrument on 2026-08-24: **5.9 / 7.6 / 5.7 %**, with GPU 3.5 % and the oat
renderer 2.5 % — the same breath, the same size. So no commit between the two
dates changed the idle CPU; the 17.1 % is a property of that afternoon's machine,
not of that build, and the honest reading of the older row is that it is not
comparable. (The likely cause is this document's own invitation to keep a
development Oats open beside the measurement; two Electron trees share a GPU and
a compositor. It has not been reproduced, and is not claimed.)

**The ~1 GB was double counting — and the instrument was reading a subset.**
`rssKb()` sums `VmRSS`, and a Chromium tree shares heavily, so every shared page
was counted once per process holding it. Worse, all four tree walks read
`/proc/<pid>/task/<pid>/children`, which lists only the **main thread's**
children — and Chromium forks renderers and mojo utilities from a launcher
thread. The walk was reaching 10 of 13 processes, omitting the renderer drawing
the surface being measured, with membership varying between runs. Both are
fixed: the walk reads every thread, and PSS is reported beside summed RSS.

What the 746 MB is, on the Conversation surface at rest (post-fix run):

| Process                          | idle CPU | PSS    |
| -------------------------------- | -------- | ------ |
| sidecar `whisper-server`         | 0.1 %    | 185 MB |
| sidecar `qdrant`                 | 0.1 %    | 141 MB |
| renderer `index.html?panel=true` | 0.0 %    | 96 MB  |
| browser                          | 0.3 %    | 94 MB  |
| renderer `index.html` (the oat)  | 0.1 %    | 58 MB  |
| GPU                              | 0.0 %    | 47 MB  |
| `zygote and launcher processes`  | —        | 26 MB  |
| `network.mojom.NetworkService`   | 0.0 %    | 22 MB  |
| `audio.mojom.AudioService`       | 0.0 %    | 19 MB  |
| sidecar `pactl subscribe`        | 0.0 %    | 1 MB   |

**Roughly 330 MB of that is two sidecars pre-warmed before anyone asks for
them**, and that is a trade, not a defect. `whisperManager.initializeAtStartup`
loads the model at launch so the first recording transcribes immediately;
Qdrant is up so the first search answers. Oats promises to work with no network
and no account, and paying that to keep the promise instant is the right side of
the trade. It is recorded here so the next person to consider making recording
lazy knows what they would be buying. Treat the figure as one run: across the
four runs behind this section `qdrant` measured 82–168 MB and `whisper-server`
185–188 MB.

**Read PSS with one instance running.** PSS divides each shared page among every
sharer on the machine, so a second Oats or Electron beside the measurement halves
the pages they have in common and lowers the number for a reason that has nothing
to do with the build.

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
- **Shutdown.** A `SIGTERM`'d instance still leaves `pactl subscribe`, Qdrant and
  `whisper-server` running until the next launch reaps them. `freePort` above
  handles the one consequence that breaks this instrument; the general case is
  unmeasured.
