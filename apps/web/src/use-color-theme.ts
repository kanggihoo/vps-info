/**
 * 라이트·다크 토글. 기본은 라이트이고, 고른 값은 브라우저에 남긴다(DESIGN.md).
 * OS 설정(`prefers-color-scheme`)은 따르지 않는다.
 *
 * 첫 화면이 번쩍이지 않도록 `index.html`의 인라인 스크립트가 React보다 먼저 `.dark`를 붙인다. 저장 키를 바꾸면 거기도 고친다.
 */
import { useCallback, useState } from 'react';

/** `localStorage` 키. `index.html`의 인라인 스크립트와 같아야 한다. */
const COLOR_THEME_STORAGE_KEY = 'color-theme';

export type ColorTheme = 'light' | 'dark';

/** `<html>`에 붙은 클래스로 지금 테마를 읽는다. 인라인 스크립트가 먼저 붙여 두었다. */
function readCurrentColorTheme(): ColorTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** @returns 지금 테마와, 라이트·다크를 뒤집는 함수 */
export function useColorTheme() {
  const [colorTheme, setColorTheme] = useState<ColorTheme>(readCurrentColorTheme);

  const toggleColorTheme = useCallback(() => {
    const nextColorTheme: ColorTheme = readCurrentColorTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', nextColorTheme === 'dark');
    try {
      localStorage.setItem(COLOR_THEME_STORAGE_KEY, nextColorTheme);
    } catch {
      // 저장소가 막힌 브라우저에서는 이번 방문 동안만 유지된다.
    }
    setColorTheme(nextColorTheme);
  }, []);

  return { colorTheme, toggleColorTheme };
}
