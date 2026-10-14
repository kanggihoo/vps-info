import { describe, expect, it, vi } from 'vitest';
import { activateReadingTool } from './reading-keyboard.ts';

/** `activateReadingTool`이 쓰는 만큼만 흉내 낸 버튼. 비활성 판정은 선택자에 `aria-disabled`가 들었는지로 가른다. */
function makePanel(state: { disabled?: boolean; ariaDisabled?: boolean }) {
  const click = vi.fn();
  const button = {
    dataset: {} as Record<string, string>,
    click,
    matches: (selector: string) =>
      (Boolean(state.disabled) && selector.includes(':disabled')) || (Boolean(state.ariaDisabled) && selector.includes('[aria-disabled="true"]')),
  };
  const panel = { querySelector: (selector: string) => (selector === '[data-tool-code="KeyR"]' ? button : null) } as unknown as HTMLElement;
  return { panel, click };
}

describe('activateReadingTool', () => {
  it('비활성 버튼(disabled·aria-disabled)은 누르지 않고 false를 돌려줘 단축키가 조용히 무시된다', () => {
    for (const state of [{ disabled: true }, { ariaDisabled: true }]) {
      const { panel, click } = makePanel(state);
      expect(activateReadingTool(panel, 'KeyR')).toBe(false);
      expect(click).not.toHaveBeenCalled();
    }
  });

  it('없는 단축키는 false를 돌려준다', () => {
    const { panel } = makePanel({});
    expect(activateReadingTool(panel, 'KeyZ')).toBe(false);
  });
});
