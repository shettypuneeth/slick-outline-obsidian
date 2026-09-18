# Outliner

A floating document outline for Obsidian, with a frosted-glass surface that
adapts to your theme and a circular reading-progress indicator.

## Use

1. Enable **Outliner** in Obsidian's Community plugins settings. If it is not
   listed yet, reload Obsidian so it discovers the new plugin.
2. Open a Markdown note in Live Preview or Reading View.
3. Run **Outliner: Show outliner** from the command palette.
4. Click the circular list icon to open the outline. Click a heading to
   navigate, or the top-right close button to collapse it.

Run the command again to remove the control from that pane. You can assign a
hotkey to the command in Obsidian settings.

Each pane has its own outliner. Switching notes keeps it enabled but collapses
it. Closing the pane or restarting Obsidian resets visibility. Source Mode is
not supported; the control hides until you return to a supported mode.

## Behavior

- H1 and H2 headings form a flat, scrollable list.
- The current section and active rail marker share the brighter text accent.
  The remaining rail uses a visible neutral tone; inactive headings stay faint
  with a light (300) font weight.
- Heading labels slide in from the left and fade in with a short stagger when
  the panel opens.
- A single active marker glides between headings with a subtle CSS overshoot,
  resizing to match wrapped labels.
- Heading labels wrap fully without clipping or a line limit.
- The collapsed ring sits outside the glass button and tracks document
  scrolling clockwise from the top. The collapsed button has no visible border
  or shadow; its icon and progress ring fade back in as the panel finishes closing.
- The panel stays open during scrolling and heading navigation.
- Heading labels and reading time refresh when the panel reopens, not on
  every edit. If a heading-free note gains headings, toggle the command off
  and on to refresh its disabled control.
- Reading time uses 200 words per minute, excluding frontmatter and code
  blocks.
- Duplicate heading names navigate by document position.
- Motion respects the operating system's reduced-motion preference.
- The glass background uses theme colors, blur, and translucency, with a
  solid-background fallback when backdrop blur is unavailable.

Version 1 is desktop-only and has no settings tab.

## Development

From this plugin directory:

```sh
npm install
npm run build
```

`npm run build` type-checks the source and writes `main.js` alongside
`manifest.json` and `styles.css`. Use `npm run dev` for a development watcher;
the included `.hotreload` marker opts this folder into the Hot Reload plugin
when installed. Without Hot Reload, reload Outliner in Community plugins
after changes so both the JavaScript and stylesheet are refreshed.

The project follows Chronicle's React, TypeScript, and esbuild structure.
`src/views/OutlinerView.tsx` owns the pane lifecycle and React mounting.
`src/components/` contains the shell, collapsed control, expanded panel,
heading list, and shared Obsidian icon component. `src/outliner/` contains
heading extraction, editor integration, geometry, progress state, and
navigation. The `@views/*` and `@components/*` aliases match Chronicle.

CodeMirror integration uses an editor extension and source-position anchors
instead of depending on rendered Live Preview headings, which are virtualized.
Reading View uses Obsidian's source-line scrolling API and postprocessor
section metadata.

See [SPEC.md](SPEC.md) for the product specification.
