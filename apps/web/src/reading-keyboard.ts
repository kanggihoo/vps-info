/** 읽기 패널의 포커스·키 입력 규칙. 입력 컨트롤과 정렬 동작은 기존 키를 유지한다. */

/** 입력·조합·브라우저 조합키·메뉴·정렬 중에는 읽기 단축키를 처리하지 않는다. */
export function shouldIgnoreReadingKey(event: KeyboardEvent): boolean {
  const target = event.target;
  return event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey
    || !(target instanceof HTMLElement)
    || Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"], [role="menu"], [role="tablist"], [data-sort-handle], [data-sorting="true"]'));
}

/** 해당 패널 안에서만 스크롤하고, 대상에 포커스 링을 표시한다. */
export function focusReadingTarget(target: HTMLElement): void {
  target.focus({ preventScroll: true });
  if (target.matches('[data-navigation-item]')) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** 동작 키의 버튼을 실제로 클릭하고 인식 표시를 짧게 보여 준다. */
export function activateReadingTool(panel: HTMLElement, code: string): boolean {
  const button = panel.querySelector<HTMLElement>(`[data-tool-code="${code}"]`);
  if (!button || button.matches(':disabled')) return false;
  button.dataset.shortcutActive = 'true';
  window.setTimeout(() => { delete button.dataset.shortcutActive; }, 150);
  button.click();
  return true;
}
