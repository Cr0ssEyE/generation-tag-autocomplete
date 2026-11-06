# Project instructions

## Purpose and source of truth

Build Generation Tag AutoComplete, an Android browser PWA described in `docs/SPECIFICATION.md`. Read that specification, `docs/UI_UX_IMPROVEMENTS.md` and `docs/CSV_FORMAT.md` before implementation. Record material scope changes in the specification.

The app version is 0.3.0. The UI work is implemented and has automated logic/DOM coverage; new native Android and Samsung device regression checks remain pending in docs/TESTING.md. Do not reuse the old device-test results as evidence for the new behavior. The editor keeps the Positive/Negative switch and current comma/newline item completion. Search after 120 ms of inactivity, including during IME composition; only an explicit candidate selection may replace text, with safe composition finalization and current-context checks.

The finder UI is an editor-only fixed side button opening an overlay panel with Bookmarks/Type browsing/History. Preserve the editor selection, keyboard usability and continuous insertion. Prompt loading uses a full Positive/Negative preview with separate copy actions and explicit replacement of both drafts, including empty strings. Keep the existing persistent-storage request button. Main navigation stays fixed at the top. Do not add drag controls, separate load-undo history, tag chips, AND search, automatic underscore conversion, weight handling, direct generation-server access, cloud synchronization, or APK packaging in this work.

## Local user data

- Treat non-sample CSV/TSV files in this checkout as user data, even when they are untracked or ignored.
- Preserve these files. Do not move, rewrite, delete, commit, upload, or copy their contents into fixtures, screenshots, logs, documentation, issues, or external tool requests.
- Local structural/performance inspection is permitted within the user's authorized task. Report aggregate results rather than raw sensitive rows.
- Use the synthetic `samples/tags.example.csv` for automated tests and public demonstrations. Explicitly review any new public fixture.
- Keep user backup JSON, imports, exports, browser databases, and credentials out of Git and deployment artifacts.
- Review the actual staged/tracked file list before a commit, push, or deployment. Do not rely solely on `.gitignore`.

## Implementation principles

- Process dictionaries, searches, drafts, history and saved prompts on the device.
- Do not introduce analytics, remote error collection, third-party runtime scripts, remote fonts, or APIs that receive user content.
- Render CSV fields as text. Preserve the original tag string in inserted output.
- Treat import and JSON restore as validated transactions. Failed or cancelled operations must preserve existing data.
- Keep editing responsive during parsing and searching. Use a Web Worker for dictionary work and IndexedDB for durable app data.
- Keep raw prompt text authoritative. Do not split tags on spaces or silently rewrite manual prompt syntax.
- Use Android Chrome as the primary development and validation target. Check it on a reachable Android device or emulator when available; desktop emulation does not prove Android behavior.
- Samsung Internet testing is performed manually by the project worker/administrator, who reports defects and improvement suggestions. The agent records unverified Samsung items and follows up on reports; do not require agent-controlled Samsung automation to complete implementation work.
- Record missing Android device/emulator access and any conditional Android Studio/SDK/ADB requirements in `docs/TESTING.md`. Do not claim device tests passed without running them.

## Validation and reporting

Use Node.js 24 and pnpm 11.25.0. Run `pnpm test` and `pnpm build` for logic changes. Runtime dependencies are pinned in package.json and pnpm-lock.yaml. Do not claim application tests or device checks have passed before they run. Follow `docs/IMPLEMENTATION_PLAN.md` for meaningful validation.

Retain upstream copyright and license notices when reusing code; update `THIRD_PARTY_NOTICES.md` and include required notices in distributed assets.
