/** URL 해시와 화면을 서로 바꾼다. 해시에 화면을 두어 새로고침해도 보던 화면이 유지된다. */

/** 지금 보고 있는 화면. */
export type Screen = { kind: 'feed'; feedId: string } | { kind: 'bookmarks' } | { kind: 'none' };

/**
 * URL 해시를 화면으로 해석한다.
 *
 * @param hash - `window.location.hash` 값(`#/feeds/hn-best`, `#/bookmarks` 등)
 */
export function readScreenFromHash(hash: string): Screen {
  const decodedHash = decodeURIComponent(hash);
  if (decodedHash === '#/bookmarks') return { kind: 'bookmarks' };
  const feedMatch = decodedHash.match(/^#\/feeds\/(.+)$/);
  return feedMatch ? { kind: 'feed', feedId: feedMatch[1] } : { kind: 'none' };
}

/** 화면으로 가는 링크의 해시를 만든다. */
export function makeScreenHash(screen: Exclude<Screen, { kind: 'none' }>): string {
  return screen.kind === 'bookmarks' ? '#/bookmarks' : `#/feeds/${encodeURIComponent(screen.feedId)}`;
}
