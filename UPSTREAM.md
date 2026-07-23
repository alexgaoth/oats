# Upstream provenance

Oats is implemented as a narrow extension of OpenWhispr
(`https://github.com/OpenWhispr/openwhispr`), an MIT-licensed desktop
application for local dictation, meeting recording, transcription, summaries,
local models, and macOS/Linux packaging.

This repository (`oats-arum`) was bootstrapped from `../oats`, a working
OpenWhispr 1.7.6-based fork that already carries the first wave of Oats work
(the `conversationAide`/`conversationGraph` core, `oats-setup-check`, the
`test:oats` suite, and rebranded prose docs). `oats-arum` is where the SaaS
subtraction and full rebrand happen; see `IMPLEMENTATION.md` for the plan.

- **Upstream:** OpenWhispr 1.7.6, imported into `../oats` on 2026-07-20.
- **This repo:** bootstrapped from `../oats` on 2026-07-23.

The original MIT license and notices remain in [LICENSE](./LICENSE).

To configure a tracking remote against upstream OpenWhispr in a writable
checkout:

```sh
git remote add upstream https://github.com/OpenWhispr/openwhispr.git
```
