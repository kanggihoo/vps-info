import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToolbarButton } from './toolbar-button.tsx';

function render(props: Partial<Parameters<typeof ToolbarButton>[0]>): string {
  const button = createElement(ToolbarButton, { label: '원문 읽기', shortcut: 'R', onClick: () => {}, children: null, ...props });
  return renderToStaticMarkup(createElement(TooltipProvider, null, button));
}

describe('ToolbarButton', () => {
  it('쓸 수 있으면 이름과 단축키를 알리고 눌린다', () => {
    const html = render({});
    expect(html).toContain('aria-label="원문 읽기"');
    expect(html).toContain('aria-keyshortcuts="R"');
    expect(html).not.toContain('aria-disabled');
  });

  it('쓸 수 없으면 버튼은 남기되 이유를 알리고 단축키는 알리지 않는다 (이슈 #10)', () => {
    const html = render({ unavailableReason: '이 Feed는 원문 읽기를 지원하지 않습니다' });
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="이 Feed는 원문 읽기를 지원하지 않습니다"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('aria-keyshortcuts');
    expect(html).not.toContain('aria-pressed');
    // 진짜 disabled면 마우스 이벤트가 막혀 툴팁이 뜨지 않는다.
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });
});
