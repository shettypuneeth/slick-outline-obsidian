# Repository Guide

## Project

Outliner is a desktop-only Obsidian community plugin. It adds a pane-local,
floating H1-H4 outline with reading progress, heading navigation, draggable
placement, and persisted settings.

Use `README.md` for setup and current user-facing behavior. Treat `SPEC.md` as
the detailed product contract; update both when a change intentionally alters
documented behavior.

## Commands

Run commands from the repository root:

```sh
npm install       # first-time dependency setup
npm run build     # strict TypeScript check and production bundle
npm run dev       # esbuild watch mode for local Obsidian development
```

There is currently no automated test or lint script. `npm run build` is the
required validation for code changes. Manually exercise affected behavior in
Obsidian when a change depends on pane lifecycle, scrolling, layout, pointer
input, Live Preview, or Reading View.

## Repository Layout

- `src/main.ts`: plugin lifecycle, command registration, shared settings, and
  pane ownership.
- `src/views/OutlinerView.tsx`: per-pane DOM integration, measurement,
  positioning, dragging, rendering, and cleanup.
- `src/components/`: React presentation and interaction components.
- `src/outliner/`: parsing, navigation, editor/Reading View adapters, geometry,
  reading-time calculations, and progress state.
- `src/utils/draggable.ts`: reusable pointer gesture handling.
- `src/settings.ts`: settings schema, validation, persistence UI, and defaults.
- `styles.css`: all plugin styling, animation, responsive geometry, and
  reduced-motion behavior.
- `manifest.json` and `versions.json`: Obsidian release metadata.
- `main.js`: generated bundle; do not edit it directly.
- `data.json`: local plugin state; do not treat it as source or commit it.

## Implementation Conventions

- Keep TypeScript strict and avoid unsafe casts. Preserve
  `noUncheckedIndexedAccess`, explicit cleanup, and narrow runtime validation
  at persisted-data and DOM boundaries.
- Prefer pure logic in `src/outliner/` and keep Obsidian/DOM lifecycle work in
  adapters or `OutlinerView`.
- Preserve pane-local behavior: enabling, expanding, navigating, and cleanup
  belong to the specific `WorkspaceLeaf`; persisted placement and reading speed
  are shared settings.
- Live Preview uses CodeMirror source positions because rendered headings are
  virtualized. Reading View uses Obsidian section metadata. Do not replace
  either path with heading-text lookup; duplicate headings must remain distinct.
- Heading labels and reading time are snapshot-based and intentionally do not
  refresh on every edit. Keep navigation anchors correct without accidentally
  changing the documented refresh behavior.
- Keep layout calculations in the existing geometry helpers where possible.
  DOM reads and writes should remain batched around animation frames to avoid
  scroll-time layout thrashing.
- Use the pane's `ownerDocument`/`defaultView` for DOM, observers, timers, and
  animation APIs so pop-out windows continue to work.
- Register Obsidian-managed resources with plugin registration APIs. Explicitly
  dispose pane-owned React roots, observers, listeners, animation frames, and
  pointer state when panes close or the plugin unloads.
- Use Obsidian theme variables and prefix plugin selectors with `outliner-`.
  Preserve keyboard focus, ARIA state, tooltips, and
  `prefers-reduced-motion` behavior when changing interactions or animation.
- Follow existing formatting: two-space indentation, single quotes, semicolons,
  type-only imports where applicable, and comments only for non-obvious
  invariants.

## Change Checklist

1. Make source changes under `src/` and/or `styles.css`; never hand-edit
   `main.js`.
2. Update `README.md` and `SPEC.md` when user-visible behavior changes.
3. Run `npm run build`.
4. For release changes, keep the versions in `package.json`, `manifest.json`,
   and `versions.json` consistent.
