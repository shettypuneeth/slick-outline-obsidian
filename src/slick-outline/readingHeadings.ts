import type { App, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';

interface HeadingPosition {
  path: string;
  line: number;
}

export class ReadingHeadings {
  private readonly positions = new WeakMap<HTMLElement, HeadingPosition>();

  constructor(private readonly app: App) {}

  /** Associates a rendered section's heading elements with source lines from Obsidian's metadata. */
  process(element: HTMLElement, context: MarkdownPostProcessorContext): void {
    const file = this.app.vault.getFileByPath(context.sourcePath);
    const section = context.getSectionInfo(element);
    if (!file || !section) return;

    const cachedHeadings = (this.app.metadataCache.getFileCache(file)?.headings ?? [])
      .filter((heading) =>
        heading.level <= 4 &&
        heading.position.start.line >= section.lineStart &&
        heading.position.start.line <= section.lineEnd);
    const headingElements = this.elements(element);

    // Match headings within this rendered section, not the virtualized document as a whole.
    headingElements.forEach((headingElement, index) => {
      const cachedHeading = cachedHeadings[index];
      if (cachedHeading) {
        this.positions.set(headingElement, { path: context.sourcePath, line: cachedHeading.position.start.line });
      }
    });
  }

  /**
   * Returns currently rendered headings belonging to this note.
   * Virtualized, hidden, and embedded headings are excluded from DOM-based position refinement.
   */
  entries(view: MarkdownView): { element: HTMLElement; line: number }[] {
    const path = view.file?.path;
    return this.elements(view.previewMode.containerEl).flatMap((element) => {
      const position = this.positions.get(element);
      return position && position.path === path && element.getClientRects().length > 0
        ? [{ element, line: position.line }]
        : [];
    });
  }

  private elements(container: HTMLElement): HTMLElement[] {

    // Embedded notes have their own source positions and must not enter this outline.
    return Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
      .filter((element) => !element.closest('.markdown-embed, .internal-embed'));
  }
}
