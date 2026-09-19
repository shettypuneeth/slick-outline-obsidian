import { GFM, parser } from '@lezer/markdown';

export interface OutlineHeading {
  id: string;
  label: string;
  level: 1 | 2;
  line: number;
  from: number;
  to: number;
}

export interface OutlineSnapshot {
  headings: OutlineHeading[];
  wordCount: number;
}

const markdown = parser.configure(GFM);

/** Removes inline Markdown decoration while retaining visible link labels and wiki-link aliases. */
export function headingLabel(text: string): string {
  return text
    .replace(/!?\[\[([^\]]+)\]\]/g, (_, target: string) =>
      target.split('|').pop() ?? target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\\([\\`*{}\[\]()#+.!_>-])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts H1/H2 headings and counts words without treating frontmatter or code as prose.
 * Heading ranges retain original character offsets and zero-based source lines for navigation.
 */
export function buildOutline(source: string): OutlineSnapshot {

  // Mask frontmatter without shifting source offsets or line numbers.
  const frontmatter = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
  const maskedSource = source.replace(frontmatter, (value) => value.replace(/[^\r\n]/g, ' '));
  const tree = markdown.parse(maskedSource);

  const headings: OutlineHeading[] = [];
  const excludedCodeRanges: { from: number; to: number }[] = [];

  const lineStartOffsets = [0];
  for (let offset = 0; offset < maskedSource.length; offset++) {
    if (maskedSource[offset] === '\n') lineStartOffsets.push(offset + 1);
  }

  // Binary search maps parser offsets to zero-based source lines without rescanning.
  const lineAt = (offset: number) => {
    let low = 0;
    let high = lineStartOffsets.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (lineStartOffsets[middle]! <= offset) low = middle;
      else high = middle;
    }
    return low;
  };

  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        excludedCodeRanges.push({ from: node.from, to: node.to });
        return false;
      }
      if (!/^(ATX|Setext)Heading[12]$/.test(node.name)) return;
      const rawHeading = maskedSource.slice(node.from, node.to);
      const title = node.name.startsWith('ATX')
        ? rawHeading.replace(/^ {0,3}#{1,2}(?:[ \t]+|$)/, '').replace(/[ \t]+#+[ \t]*$/, '')
        : rawHeading.replace(/\r?\n[ \t]*[=-]+[ \t]*$/, '');
      headings.push({
        id: `heading-${node.from}`,
        label: headingLabel(title) || 'Untitled heading',
        level: node.name.endsWith('1') ? 1 : 2,
        line: lineAt(node.from),
        from: node.from,
        to: node.to,
      });
      return false;
    },
  });

  // Ignore code blocks in reading time; spaces prevent adjacent words from merging.
  let prose = '';
  let offset = 0;
  for (const range of excludedCodeRanges) {
    prose += maskedSource.slice(offset, range.from) + ' ';
    offset = range.to;
  }
  prose += maskedSource.slice(offset);
  const wordCount = prose.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return { headings, wordCount };
}
