import type { App, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';

interface HeadingPosition {
  path: string;
  line: number;
}

export class ReadingHeadings {
  private readonly positions = new WeakMap<HTMLElement, HeadingPosition>();

  constructor(private readonly app: App) {}

  process(element: HTMLElement, context: MarkdownPostProcessorContext): void {
    const file = this.app.vault.getFileByPath(context.sourcePath);
    const section = context.getSectionInfo(element);
    if (!file || !section) return;
    const headings = (this.app.metadataCache.getFileCache(file)?.headings ?? [])
      .filter((heading) =>
        heading.level <= 2 &&
        heading.position.start.line >= section.lineStart &&
        heading.position.start.line <= section.lineEnd);
    const elements = this.elements(element);
    elements.forEach((heading, index) => {
      const cached = headings[index];
      if (cached) {
        this.positions.set(heading, { path: context.sourcePath, line: cached.position.start.line });
      }
    });
  }

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
    return Array.from(container.querySelectorAll<HTMLElement>('h1, h2'))
      .filter((element) => !element.closest('.markdown-embed, .internal-embed'));
  }
}
