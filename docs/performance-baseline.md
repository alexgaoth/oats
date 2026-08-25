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

| Metric                     | `933f7cb` | before  | after     |
| -------------------------- | --------- | ------- | --------- |
| idle CPU — conversation    | 6.2 %     | 6.2 %   | **0.3 %** |
| idle CPU — intelligence    | 7.5 %     | 8.2 %   | **1.7 %** |
| idle CPU — settings        | 6.3 %     | 6.5 %   | **0.6 %** |
| of which: GPU process      | 3.1 %     | 3.2 %   | 0.0 %     |
| of which: the oat renderer | 2.3 %     | 2.3 %   | 0.0 %     |
| idle PSS — conversation    | 670 MB    | 805 MB  | 771 MB    |
| idle summed RSS            | 1204 MB   | 1333 MB | 1250 MB   |

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

Three runs of this instrument, all recorded, all on the same machine on the same
evening. Every number below comes from one of these files; nothing here is quoted
from an unrecorded run.

| Run                                                        | File                                       |
| ---------------------------------------------------------- | ------------------------------------------ |
| `933f7cb`, the commit the 2026-08-19 row was recorded from | `docs/perf/fedora-2026-08-24-933f7cb.json` |
| today, with only the fix below reverted                    | `docs/perf/fedora-2026-08-24-prefix.json`  |
| today, as shipped                                          | `docs/perf/fedora-2026-08-24.json`         |

| Metric                     | `933f7cb` | before  | after     |
| -------------------------- | --------- | ------- | --------- |
| idle CPU — conversation    | 6.2 %     | 6.2 %   | **0.5 %** |
| idle CPU — intelligence    | 7.5 %     | 8.2 %   | **1.8 %** |
| idle CPU — settings        | 6.3 %     | 6.5 %   | **0.5 %** |
| of which: GPU process      | 3.1 %     | 3.2 %   | 0.0 %     |
| of which: the oat renderer | 2.3 %     | 2.3 %   | 0.1 %     |
| idle memory — PSS          | 670 MB    | 805 MB  | 823 MB    |
| idle memory — summed RSS   | 1204 MB   | 1333 MB | 1359 MB   |

**The idle CPU was one CSS animation on a 96-pixel window.**
`.oats-listening-pulse::before` carries `animation: oats-breathe … infinite`, and
`src/App.jsx` — the inherited dictation panel, not the Oats `ListeningPulse`
component — put that class in its **base** class list. So the floating oat
breathed in every state, `idle` and `hover` included. It is always on top and
almost always idle, `--disable-gpu-compositing` is on for Linux, and every frame
of that breath is read back on the CPU. The GPU process and the oat's renderer
together are 5.5 of the 6.2 points before, and 0.0 after.

It was also a lie in the interface. `DESIGN.md` §9.1 is explicit — the seed
breathes _while a session is live_, and "**Idle = static gold seed**" — because
the difference between listening and not listening is the one thing this window
exists to say. `ListeningPulse.tsx` implements exactly that with
`state !== "live" && "before:hidden"`; the inherited panel never did.

`processing` deliberately keeps the breath. Motion is the only positive sign this
window has that work is happening, and it is bounded by the transcription rather
than by the app being open, so it is not an idle cost. It does not re-create the
"says listening when nothing is heard" problem: the listening signifier here is
the full-strength gold rim, which both live states carry and processing does not.

**The 17.1 % does not reproduce on its own commit.** `933f7cb` — the tree the
2026-08-19 row was recorded from — was checked out into a separate worktree,
`npm install`ed for the five packages removed since, given this repository's
`resources/bin` so its sidecars could actually start (they are gitignored;
without them nothing starts and the memory figure is meaningless), and driven by
this instrument: **6.2 / 7.5 / 6.3 %** — within noise of today's pre-fix
**6.2 / 8.2 / 6.5 %**, with the same ~5.4 points of breath. So no commit between
the two dates changed idle CPU, the field's deletion is ruled out as an
explanation, and the older row is not comparable to anything. Why that afternoon
read 17.1 % is not established; only that the build does not.

**The ~1 GB was double counting — and the instrument was reading a subset.**
`rssKb()` sums `VmRSS`, and a Chromium tree shares heavily, so every shared page
was counted once per process holding it. Worse, all four tree walks read
`/proc/<pid>/task/<pid>/children`, which lists only the **main thread's**
children — and Chromium forks renderers and mojo utilities from a launcher
thread, so the walk reached 10 of 13 processes, omitting the renderer drawing the
surface being measured. Worse still, `findBrowserPid` returned the **node
launcher** rather than the browser: `/proc` enumerates in ascending pid order,
the launcher carries the same `--remote-debugging-port` flag, and a substring
scan cannot tell them apart — so ~27 MB of harness was being counted as
application, and on one occasion the scan returned a shell. All three are fixed;
the browser pid now comes from `SystemInfo.getProcessInfo`, which is the only
party that actually knows.

Read PSS as a range, not a constant. Across the three recorded runs the
Conversation surface measured **670, 805 and 771 MB**, and `qdrant` alone 79 to
100 MB; a critic's independent run of the shipped build measured 557–656 MB. It
moves with what else on the machine shares pages, and with how long the sidecars
have been up. The claim that survives is the shape — **not ~1 GB resident, and
summed RSS over-reports by roughly 40 %.**

What the tree is, on the Conversation surface at rest (the shipped run):

| Process                          | idle CPU | PSS        |
| -------------------------------- | -------- | ---------- |
| sidecar `whisper-server`         | 0.1 %    | 185 MB     |
| renderer `index.html?panel=true` | 0.0 %    | 83 MB      |
| sidecar `qdrant`                 | 0.1 %    | 79 MB      |
| browser                          | 0.2 %    | 78 MB      |
| GPU                              | 0.0 %    | 55 MB      |
| renderer `index.html` (the oat)  | 0.0 %    | 49 MB      |
| zygote processes                 | —        | 23 MB      |
| `network.mojom.NetworkService`   | 0.0 %    | 18 MB      |
| `audio.mojom.AudioService`       | 0.0 %    | 17 MB      |
| sidecar `pactl subscribe`        | 0.0 %    | 1 MB       |
| **— whole tree, this instant**   | —        | **588 MB** |

The rows sum to the whole-tree row, which is read at the moment the table is
built. The per-surface PSS printed above it is a different sample, taken during
the idle loop, and will differ by a few tens of MB; that gap is sampling drift,
not a missing process.

**264 to 286 MB of that is two sidecars pre-warmed before anyone asks for
them** (`whisper-server` 185–186 MB, `qdrant` 79–100 MB, across the three
recorded runs), and that is a trade, not a defect. `whisperManager.initializeAtStartup`
loads the model at launch so the first recording transcribes immediately;
Qdrant is up so the first search answers. Oats promises to work with no network
and no account, and paying that to keep the promise instant is the right side of
the trade. It is recorded here so the next person to consider making recording
lazy knows what they would be buying.

**Read PSS with one instance running.** PSS divides each shared page among every
sharer on the machine, so a second Oats or Electron beside the measurement halves
the pages they have in common and lowers the number for a reason that has nothing
to do with the build.

**Intelligence's extra point is entry cost, not idle cost.** It reproducibly
idles above the other two — 1.7 % against 0.3 % and 0.6 % in the shipped run, and
~1.2 points above its siblings in both pre-fix builds. Attributing that surface
separately says where it is not: its per-process rows sum to **0.6 %**, against
the **1.7 %** the same run reports for the surface. The difference is the sampling
offset. The per-surface figure starts 1.5s after the switch; the attribution's own
window starts about five seconds after it, behind the renderer identification and
its settle. So the extra cost is work Intelligence does on entry that has decayed
by the second window — consistent with the `IntersectionObserver`-gated contour
drawing and transcript parsing that surface does as rows come into view. It is a
cost of arriving, which is bounded, not a cost of sitting there.

### The floating oat cannot be focused, and that changed what "unavailable" means

Worth recording because it took an A/B to establish and it is not obvious from
the code: the oat window is created `focusable: false` (`windowConfig.js`), so it
**never receives keyboard focus and fires no focus events at all** — measured,
`document.hasFocus()` is `false` and a `focusin` listener counts zero events even
as `activeElement` moves under a programmatic `.focus()`. Every `onFocus`/`onBlur`
on that window is therefore dead code today.

That matters because the on-screen "Cancel" control is mounted only while the
pointer hovers, which makes it pointer-only by construction rather than by
oversight. The escape that does work without a pointer is the cancel hotkey — and
it only called `cancelRecording()`, so it did nothing while a transcription was
running, even though `cancelProcessing()` existed and the hover UI already offered
it. A hung `whisper-server` — a failure this app watches for elsewhere — had no
non-pointer escape at all. It does now.

### Found while measuring, not fixed

Both are on the floating oat, both pre-existing, both outside this goal:

- **The tooltip is wider than its window.** The window is 96px and does not
  resize on hover, and the tooltip is `whitespace-nowrap`. Measured live at rest
  the tooltip is 25px and fits; during a conversation it is **209px at
  `left: -117`**, so two thirds of it is outside the window. Which two thirds
  depends on `panelStartPosition`: anchored bottom-right the _tail_ survives
  ("… click to finish"), anchored bottom-left the head does. `app.mic.recording`
  (70px) and `app.mic.processing` (73px) fit; `app.mic.conversation` does not, in
  any of the ten locales (129–279px), and `clickToSpeak` overflows in de, ru, es
  and it. The cheap fix is to drop `whitespace-nowrap` and let it wrap into the
  ~52px above the button — it does **not** require resizing the window, and so
  does not touch the `setIgnoreMouseEvents` click-through model.
- **The elapsed clock clips past 100 minutes.** It renders `m:ss` with unbounded
  minutes, so `83:45` measures 44px at `left: 0` and just fits, while `100:45`
  measures 50px at `left: -6` and loses its leading digit — a 100-minute
  conversation reads `00:45`, which is a minute and a half. (45 seconds renders
  `0:45`, four characters, and fits; the two are not identical, they are merely
  both short.) (An earlier review
  reported this as failing past one hour, from a measurement of `1:23:45` — a
  string this code never produces.)

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
