# Outliner for Obsidian

## Overview

Outliner is a floating document-outline plugin for Obsidian. It provides a
compact reading-progress control that morphs into a navigable list of the
current note's sections.

The interaction should feel like one physical object changing shape rather
than a button disappearing and a separate panel appearing. The expanded
outline tracks the reader's current section and provides direct navigation to
H1 and H2 headings.

## Product behavior

### Activation and lifecycle

- Register a command named **Show outliner**.
- Nothing is displayed by default.
- Running the command toggles the entire outliner for the active Markdown pane.
- Outliner state is maintained independently for each pane until that pane
  closes or Obsidian restarts.
- When an enabled pane opens another note:
  - Rebuild the outline for the new note.
  - Return the outliner to its collapsed state.
- Support Live Preview and Reading View.
- Version 1 is desktop-only, but the architecture should preserve a path to
  later mobile support.

### Collapsed state

- Display a 36 px circular control using Obsidian's Lucide `list` icon.
- Place it as a floating overlay near the top-left of the Markdown editor,
  below the Properties area.
- Keep its position fixed relative to the editor viewport while the document
  scrolls.
- Draw a 2.5 px circular progress track outside the 36 px glass control, in a
  42 px SVG with its inner stroke edge flush against the control. Keep the ring outside the clipped morph
  shell and hide it while the panel is expanded.
- Fill the progress track clockwise from 12 o'clock.
- Calculate progress as:

  ```text
  progress = scrollTop / (scrollHeight - clientHeight)
  ```

- Clamp progress between `0` and `1`.
- For a document without scrollable overflow, show a complete progress ring.
- Clicking the control expands the outliner.
- If the note has no H1 or H2 headings:
  - Keep the control visible.
  - Display it in a disabled, muted state.
  - Show the tooltip **No H1 or H2 headings**.
  - Clicking it does nothing.

### Expanded state

- Morph the collapsed circle into a floating panel.
- Preserve the top-left anchor and grow down and to the right.
- Use a width of 280 px.
- Use a maximum height of 420 px.
- Overlay the document without changing the editor layout.
- Use a glassmorphic background: translucent Obsidian theme colors, backdrop
  blur, a subtle theme-colored border, and a soft shadow. Fall back to an
  opaque theme background when backdrop blur is unavailable.
- Keep the panel open while the document scrolls.
- Place a close button at the top-right of the panel.
- Only the close button collapses the expanded panel:
  - Clicking outside does nothing.
  - Pressing Escape does nothing.
- Running **Show outliner** while the control is visible removes the entire
  outliner rather than collapsing it.

## Animation

- Use an approximately 260 ms polished, material-style morph.
- The transition must feel like one object changing shape rather than two
  elements cross-fading.
- Animate through the following sequence:
  1. Widen the circle into an intermediate pill shape.
  2. Grow the shell toward its final width and height.
  3. Progressively reveal the reading time, close button, rail, and headings.
- When `prefers-reduced-motion: reduce` is active:
  - Replace the morph with a short opacity fade.
  - Disable smooth scrolling during heading navigation.

## Outline content

The expanded panel contains:

1. Estimated reading time.
2. A scrollable heading list with an active-section rail.

A Back action is not included in version 1.

### Reading time

Display reading time as:

```text
~N min read
```

Calculation rules:

- Use 200 words per minute.
- Round upward to the next whole minute.
- Exclude YAML frontmatter.
- Exclude fenced code blocks.
- Count the remaining Markdown text.
- Display a minimum of `~1 min read`.

### Heading extraction

- Include only H1 and H2 headings.
- Preserve document order.
- Present both levels as a flat list with uniform styling.
- Do not indent H2 headings.
- Wrap heading labels to as many lines as needed, including long unbroken
  words. Do not truncate or clamp labels.
- Show the full heading text in a tooltip.
- Preserve distinct document targets for duplicate heading names.
- Do not update the list continuously as the user edits.
- Rebuild the list when:
  - The panel is reopened.
  - The pane opens another note.
  - The editor switches between supported modes.

### Long outlines

- Scroll the heading list independently within the 420 px panel.
- When the active section changes, scroll only enough to reveal its list item.
- Do not center the active item automatically.
- Do not move the internal list if the active item is already fully visible.
- Smoothly reveal newly active items during reading, unless reduced motion
  is enabled. Initial opening positions the list without animation.

## Active-section tracking

- Place the activation threshold 35% below the top of the editor viewport.
- Select the last heading whose document position is at or above that
  threshold.
- Before the first heading reaches the threshold, select the first heading.
- Ensure the final section can become active when the reader reaches the
  document bottom.

Style the active section using:

- A bold heading label and matching active rail segment using the brighter
  `--text-accent` color rather than the potentially translucent interactive
  accent.
- A neutral rail track using the theme's normal text color at 32% opacity,
  with rounded ends on both the track and active segment.
- Both the track and active segment are 2 px wide and share the same
  horizontal position.
- A subdued blend of the theme's muted text and background colors for inactive
  entries to separate them more clearly from the active section.

Use a single persistent active-rail indicator. Move it between headings with a
300 ms CSS transform transition that slightly overshoots before settling, and
smoothly resize it to match wrapped heading heights. Retarget in-flight
transitions rather than replacing the indicator. Initial placement and
reduced-motion mode do not animate. Measure in list-content coordinates and
clip the indicator to the track bounds.

The expanded panel's active-section rail is separate from the collapsed
control's circular document-progress ring.

## Navigation

When a heading is clicked:

- Scroll its corresponding editor heading into view.
- Place the heading near the top with a comfortable offset.
- Do not move keyboard focus or the editor cursor.
- Keep the panel expanded.
- Use smooth scrolling normally.
- Use instant scrolling when reduced motion is enabled.

Navigation must target the actual heading instance rather than relying only on
heading text, so duplicate heading names work correctly.

## Placement

Mount one overlay for each enabled Markdown pane:

- Anchor it to the pane's Markdown view container rather than the global
  workspace.
- Align it near the left side of the note content.
- Calculate a top offset beneath the Properties area when Properties is
  present, using its document position so enabling or reloading the plugin
  halfway through a note does not reset the control above Properties.
- Keep the resulting offset fixed relative to the editor viewport while
  scrolling.
- Prevent the panel from extending beyond the pane's right or bottom edges.
- Preserve down-right expansion and constrain the panel dimensions instead of
  changing its opening direction.

## Accessibility

- Give the collapsed button the accessible label
  **Open document outline**.
- Give the close button the accessible label
  **Collapse document outline**.
- Expose the no-heading explanation on the disabled button.
- Render heading entries as semantic buttons.
- Give the expanded panel an accessible navigation label such as
  **Document outline**.
- Provide visible `:focus-visible` states using Obsidian theme variables.
- Do not trap keyboard focus.
- Maintain sufficient contrast in light and dark themes.

## Technical architecture

Follow the conventions established by the sibling `chronicle-obsidian`
plugin:

- React 18 with `createRoot`.
- Strict TypeScript.
- esbuild with Obsidian and CodeMirror packages marked as external.
- Obsidian's `setIcon` API for Lucide icons.
- Obsidian CSS variables instead of hard-coded theme colors.
- Theme-aware frosted-glass surfaces for both the collapsed control and
  expanded panel.
- No settings tab or persisted plugin configuration in version 1.

Source structure:

```text
src/
  main.ts
  views/
    OutlinerView.tsx
  outliner/
    editorBridge.ts
    readingHeadings.ts
    HeadingNavigator.ts
    ProgressStore.ts
    geometry.ts
    model.ts
  components/
    OutlinerApp.tsx
    CollapsedOutliner.tsx
    ProgressRing.tsx
    ExpandedOutliner.tsx
    OutlineList.tsx
    ActiveRail.tsx
    ObsidianIcon.tsx
styles.css
```

### Pane registry

Maintain a registry similar to:

```ts
Map<WorkspaceLeaf, OutlinerView>
```

Each `OutlinerView` owns:

- Its overlay container and React root.
- Enabled and expanded state.
- Current note identity.
- Heading entries and their target elements.
- Scroll listener and active-heading state.
- Mode-specific DOM adapter.
- Cleanup for listeners, observers, and animation frames.

The view mounts into an existing Markdown pane rather than creating a separate
Obsidian sidebar. `OutlinerApp` composes the shell and coordinates focus;
`CollapsedOutliner` owns the trigger and its accessible progress description;
`ProgressRing` owns visual progress updates; `ExpandedOutliner` owns panel sizing;
and `OutlineList` owns heading rendering and active-item visibility.
`HeadingNavigator` owns navigation animations and cancellation.

Throttle scroll-derived progress and active-section calculations with
`requestAnimationFrame`. Avoid React state updates when progress or the active
heading has not materially changed.

## Version 1 acceptance criteria

1. No outliner appears until **Show outliner** runs.
2. The command affects only the active Markdown pane.
3. Live Preview and Reading View are supported.
4. Split panes maintain independent session state.
5. The collapsed ring reaches 100% at the document bottom.
6. Clicking the icon performs a continuous circle-to-panel morph.
7. The expanded panel lists H1 and H2 headings in document order.
8. Active highlighting changes at the 35% viewport threshold.
9. Duplicate heading names navigate to the correct heading instance.
10. Navigation and expansion respect reduced-motion preferences.
11. Switching notes preserves enabled state but collapses and rebuilds the
    outliner.
12. Notes without headings show a disabled control and explanatory tooltip.
13. Unloading the plugin removes every overlay, React root, listener, observer,
    and scheduled animation frame.
