# Conversation tools

These tools extend Conversations, not the primary navigation. They work from
stored records without another model request.

## Context, not another dashboard

- Press a recurring subject on Global to open its dated history. History includes
  the graph's linked conversations and matching topic names or keywords. A matching
  transcript excerpt is shown when available. A shared subject is not evidence
  that a decision changed.
- Save a passage from a transcript turn. A selection wholly inside that turn saves
  that range; otherwise the whole turn is used. The same passage can belong to
  several working sets. Each membership has its own personal note and position.
- Use the conversation tools menu to manage sets, filter conversations, apply a
  saved view, or choose two records to compare. The reader's More menu can start
  a comparison with that record already selected.
- Comparison shows stored topic names, marked passages, and unresolved questions
  with source links. Shared labels are exact normalized matches, not inferred
  equivalence. Missing question data is not presented as a known zero.
- A saved view holds a literal search and optional group, marks, and open-question
  filters. Applying it returns to the list. Missing counts do not satisfy the
  open-question filter.

Only one dialog opens at a time. Set creation and rename controls appear when
requested, not as permanent forms. Transcript save controls appear on hover or
keyboard focus, and remain visible on touch devices. Reader navigation fetches
the requested source even when it is outside the newest-100 store.

## Source integrity

Working sets store note and segment identifiers, UTF-16 offsets (end exclusive),
and a hash of the referenced text. They do not store a second copy of its transcript
or title. A changed passage is flagged instead of silently reusing its old offsets.
A deleted source leaves a removable membership, but exposes no deleted title or
quotation. Removing a membership or deleting a set never deletes its source.
Personal notes remain independent across sets.

Set and saved-view names are normalized, case-insensitively unique, and limited
to 80 characters. Personal notes are limited to 500 characters. Saved criteria
have an explicit version; malformed or newer versions are not applied.

Library reads use creation time descending, then note ID descending, with bounded
pages. Editing an old record does not move it into a newer page. Subject matching
and filters reach the database, not just the renderer's newest records. Existing
FTS tables and triggers remain unchanged.

Committed mutations notify other windows. Dialogs subscribe to source changes,
show retryable errors, preserve unsaved personal notes across unrelated refreshes,
and return focus to their entry point. Opening a source moves focus to its title
after the reader mounts.

## Comparison layout

Results show each conversation title once. Change selection returns to the picker,
where the selected records remain removable. Matching evidence sections align
across the two columns so topics, marks and questions can be read across. Narrow
windows keep one complete conversation after the other.

Switching between the picker and results restores focus and the dialog's top.
Background record refreshes do not move the reader's focus or scroll position.
The previous independent-column layout remains available in the demo with
`comparisonLayout=classic`, or in a build with `VITE_OATS_COMPARISON_LAYOUT=classic`.
This adds no visible setting and changes no evidence or saved data.

## Recording controls

The default remains Clean. Show transcript opens the optional detail area;
Transcript and Questions tabs avoid stacking both kinds of text. The existing
questions count opens Questions directly. Hide details returns to Clean.

This replaces the ambiguous Calm / Words names with an explicit action and
removes one competing text region. Recording, detection, automatic search,
checkpointing, and announcements do not depend on the selected view. The question
rail stays mounted when only its announcements are needed.

For a side-by-side design check, use the demo's `recordingControls=classic` query
or build with `VITE_OATS_RECORDING_CONTROLS=classic`. This is not a new user mode.

## Checks

Run `npm run verify:oats` and `npm run i18n:check` under Node 24. Database tests
need the project's Electron-compatible `better-sqlite3` binding.

The browser preview uses fictional fixtures and a fake microphone:

```sh
npm run demo:harness -- --host 127.0.0.1 --port 5391 --strictPort
```

Open `/demo.html?panel=true` on that server. Check subject history, selected text
and whole-turn saving, multi-set notes and order, source updates and deletion,
saved criteria, comparison, retry, Escape, and focus return. Use `profile=many`
to page beyond 100 records. Use `demo=live&from=180&end=hold` to check recording
controls without a real microphone. Check both themes, reduced motion, and a short
window; Stop and health warnings must remain visible.
