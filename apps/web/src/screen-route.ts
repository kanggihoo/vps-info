/** URL 해시와 화면을 서로 바꾼다. 해시에 화면과 펼친 Entry를 두어 새로고침해도 보던 화면이 유지된다. */

/** 지금 보고 있는 화면. `entryId`는 오른쪽에 펼친 Entry다(ADR-0011). */
export type Screen = { kind: 'feed'; feedId: string; entryId?: number } | { kind: 'bookmarks'; entryId?: number } | { kind: 'none' };

/** `entries/<id>`의 id. 양의 정수가 아니면 펼친 Entry가 없는 것으로 친다. */
function readEntryId(segment: string | undefined): { entryId?: number } {
  return segment !== undefined && /^[1-9]\d*$/.test(segment) ? { entryId: Number(segment) } : {};
}

/**
 * URL 해시를 화면으로 해석한다.
 *
 * @param hash - `window.location.hash` 값(`#/feeds/hn-best`, `#/feeds/hn-best/entries/12`, `#/bookmarks/entries/3` 등)
 */
export function readScreenFromHash(hash: string): Screen {
  const decodedHash = decodeURIComponent(hash);
  const bookmarksMatch = decodedHash.match(/^#\/bookmarks(?:\/entries\/([^/]*))?$/);
  if (bookmarksMatch) return { kind: 'bookmarks', ...readEntryId(bookmarksMatch[1]) };
  // Feed id에 `/`가 들어갈 수 있어서, 끝의 `/entries/<id>`만 떼어 낸다.
  const feedMatch = decodedHash.match(/^#\/feeds\/(.+?)(?:\/entries\/([^/]*))?$/);
  return feedMatch ? { kind: 'feed', feedId: feedMatch[1], ...readEntryId(feedMatch[2]) } : { kind: 'none' };
}

/** 화면으로 가는 링크의 해시를 만든다. `entryId`가 있으면 그 Entry를 펼친 화면이다. */
export function makeScreenHash(screen: Exclude<Screen, { kind: 'none' }>): string {
  const base = screen.kind === 'bookmarks' ? '#/bookmarks' : `#/feeds/${encodeURIComponent(screen.feedId)}`;
  return screen.entryId === undefined ? base : `${base}/entries/${screen.entryId}`;
}
