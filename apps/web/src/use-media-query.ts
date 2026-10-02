/** 반응형 표시와 조작을 같은 화면 너비 기준으로 맞춘다. */
import { useEffect, useState } from 'react';

/** 화면 너비 조건을 구독한다. CSS의 md/lg 기준을 조작 동작에도 사용한다. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
