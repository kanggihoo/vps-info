import { describe, expect, it } from 'vitest';
import { buildClipboardMarkdown } from './entry-clipboard.ts';

const base = {
  title: 'Show HN: "Foo": a tool',
  url: 'https://example.com/foo',
  feedTitle: 'Hacker News',
  author: null,
  publishedAt: '2026-10-01T03:04:05.000Z',
  body: '본문입니다.',
  clippedAt: new Date('2026-10-02T00:00:00.000Z'),
};

describe('buildClipboardMarkdown', () => {
  it('frontmatter 뒤에 본문을 붙이고, 값이 없는 속성은 뺀다', () => {
    expect(buildClipboardMarkdown(base)).toBe(
      [
        '---',
        'title: "Show HN: \\"Foo\\": a tool"',
        'source: "https://example.com/foo"',
        'feed: "Hacker News"',
        'published: 2026-10-01',
        'clipped: 2026-10-02',
        '---',
        '',
        '본문입니다.',
        '',
      ].join('\n'),
    );
  });

  it('번역 제목·작성자·마감일이 있으면 속성에 넣는다', () => {
    const result = buildClipboardMarkdown({ ...base, author: 'kim', originalTitle: 'Orig', deadline: '2026-11-01' });
    expect(result).toContain('original_title: "Orig"');
    expect(result).toContain('author: "kim"');
    expect(result).toContain('deadline: 2026-11-01');
  });

  it('본문이 없어도 frontmatter는 만든다', () => {
    expect(buildClipboardMarkdown({ ...base, body: null }).endsWith('---\n')).toBe(true);
  });
});
