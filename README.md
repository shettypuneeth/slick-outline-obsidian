# SlickOutline

A floating document outline for Obsidian, with a frosted-glass surface that
adapts to your theme and a circular reading-progress indicator.

## Use

1. Enable **SlickOutline** in Obsidian's Community plugins settings. If it is not
   listed yet, reload Obsidian so it discovers the new plugin.
2. Open a Markdown note in Live Preview or Reading View.
3. Run **SlickOutline: Show outline** from the command palette.
4. Click the circular list icon to open the outline. Click a heading to
   navigate, or the top-right close button to collapse it.

Run the command again to remove the control from that pane. You can assign a
hotkey to the command in Obsidian settings.

Each pane has its own outline. Switching notes keeps it enabled but collapses
it. Closing the pane or restarting Obsidian resets visibility. Source Mode is
not supported; the control hides until you return to a supported mode.

## Behavior

- In **Settings -> SlickOutline -> Reading speed**, set a positive whole number of
  words per minute (default **200**). Press Enter or leave the field to save.
  Reading-time estimates update in enabled panes without reopening the outline.
- In **Settings -> SlickOutline -> Placement**, choose **Top left** (default),
  **Top right**, **Bottom left**, or **Bottom right**. The choice is saved and
  applies immediately to all enabled panes.
- Drag the collapsed circle to choose a custom position inside its pane.
  A small movement threshold keeps ordinary clicks working; releasing a drag
  never opens the panel. Near an edge, a dashed circle previews the snap target.
- Custom positions are remembered proportionally across window sizes and
  applied to other enabled panes after dropping. The Placement dropdown shows
  **Custom position**; choosing a corner replaces it. **Reset to defaults**
  clears the custom position and restores **Top left** and **200 words per minute**.
- Press Escape during a drag to cancel. Expanded panels cannot be dragged;
  dragging still works when a note has no headings. Keyboard movement is not
  included in version 1.
- The outline sits 36px inside the selected side of the pane. Top placements
  align with Properties (or the note title when Properties is hidden); bottom
  placements sit at least 48px above the pane's bottom edge and leave 24px above
  an overlapping status bar. It stays fixed while scrolling.
- The panel expands inward from the selected corner and fits that side's
  empty gutter at 200-280px wide, leaving a 24px gap
  before the note. Narrow gutters use a compact, up-to-240px overlay instead.
- At custom positions the panel opens toward the available space, without
  moving the circle or extending past the pane and status-bar clearance.
- Panel contents stay anchored to the selected corner while the shell expands
  or collapses, avoiding extra movement at bottom and right placements.
- H1-H4 headings appear in document order, with 12px of base left padding and
  16px of additional indentation per level after H1.
  Wrapped lines align with their heading text, and all levels share one active rail.
  Indentation follows the actual heading level even when intermediate levels are skipped.
- The current section and active rail marker share the brighter text accent.
  The remaining rail uses a visible neutral tone; inactive headings stay faint
  with a light (300) font weight.
- Heading labels slide in from the left and fade in over 300ms, with a 35ms
  stagger when the panel opens. Stagger delays are capped for long outlines.
- A single active marker glides between headings with a subtle CSS overshoot,
  resizing to match wrapped labels.
- Heading labels wrap fully without clipping or a line limit.
- The collapsed ring sits outside the glass button and tracks document
  scrolling clockwise from the top. The collapsed button has no visible border
  or shadow. Only the progress ring fades back in after the panel finishes closing;
  the button and container do not fade.
- The panel stays open during scrolling and heading navigation.
- Closing clips the contents inside a 300ms shrinking shell. The border and
  shadow fade only near the end, before the progress ring returns.
- Heading labels and reading time refresh when the panel reopens, not on
  every edit. If a heading-free note gains headings, toggle the command off
  and on to refresh its disabled control.
- Reading time uses 200 words per minute, excluding frontmatter and code
  blocks.
- Duplicate heading names navigate by document position.
- Motion respects the operating system's reduced-motion preference.
- The glass background uses theme colors, blur, and translucency, with a
  solid-background fallback when backdrop blur is unavailable.

Version 1 is desktop-only.

## Development

From this plugin directory:

```sh
npm install
npm run build
```

`npm run build` type-checks the source and writes `main.js` alongside
`manifest.json` and `styles.css`. Use `npm run dev` for a development watcher;
the included `.hotreload` marker opts this folder into the Hot Reload plugin
when installed. Without Hot Reload, reload SlickOutline in Community plugins
after changes so both the JavaScript and stylesheet are refreshed.

The project follows Chronicle's React, TypeScript, and esbuild structure.
`src/views/SlickOutlineView.tsx` owns the pane lifecycle and React mounting.
`src/components/` contains the shell, collapsed control, expanded panel,
heading list, and shared Obsidian icon component. `src/slick-outline/` contains
heading extraction, editor integration, geometry, progress state, and
navigation. The `@views/*` and `@components/*` aliases match Chronicle.
`src/utils/draggable.ts` owns reusable pointer gestures, capture, cancellation,
and click suppression. It reports movement only; pane positioning remains
owned by `SlickOutlineView` and the pure geometry helpers.

CodeMirror integration uses an editor extension and source-position anchors
instead of depending on rendered Live Preview headings, which are virtualized.
Reading View uses Obsidian's source-line scrolling API and postprocessor
section metadata.

See [SPEC.md](SPEC.md) for the product specification.
