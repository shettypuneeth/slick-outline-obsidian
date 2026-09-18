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
  minutes: number;
}

const markdown = parser.configure(GFM);

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

export function buildOutline(source: string): OutlineSnapshot {
  // Mask frontmatter without shifting source offsets or line numbers.
  const frontmatter = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
  const text = source.replace(frontmatter, (value) => value.replace(/[^\r\n]/g, ' '));
  const tree = markdown.parse(text);
  const headings: OutlineHeading[] = [];
  const omitted: { from: number; to: number }[] = [];
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  const lineAt = (offset: number) => {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle]! <= offset) low = middle;
      else high = middle;
    }
    return low;
  };

  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        omitted.push({ from: node.from, to: node.to });
        return false;
      }
      if (!/^(ATX|Setext)Heading[12]$/.test(node.name)) return;
      const raw = text.slice(node.from, node.to);
      const title = node.name.startsWith('ATX')
        ? raw.replace(/^ {0,3}#{1,2}(?:[ \t]+|$)/, '').replace(/[ \t]+#+[ \t]*$/, '')
        : raw.replace(/\r?\n[ \t]*[=-]+[ \t]*$/, '');
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

  let prose = '';
  let offset = 0;
  for (const range of omitted) {
    prose += text.slice(offset, range.from) + ' ';
    offset = range.to;
  }
  prose += text.slice(offset);
  const words = prose.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return { headings, minutes: Math.max(1, Math.ceil(words / 200)) };
}
