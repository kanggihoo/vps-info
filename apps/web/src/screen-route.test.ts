import { describe, expect, it } from 'vitest';
import { makeScreenHash, readScreenFromHash } from './screen-route.ts';

describe('screen-route', () => {
  it('해시를 화면으로 해석한다', () => {
    expect(readScreenFromHash('#/feeds/hn-best')).toEqual({ kind: 'feed', feedId: 'hn-best' });
    expect(readScreenFromHash('#/bookmarks')).toEqual({ kind: 'bookmarks' });
    expect(readScreenFromHash('')).toEqual({ kind: 'none' });
    expect(readScreenFromHash('#/unknown')).toEqual({ kind: 'none' });
  });

  it('만든 해시를 다시 읽으면 같은 화면이 된다', () => {
    const feedScreen = { kind: 'feed', feedId: 'youtube/채널 1' } as const;
    expect(readScreenFromHash(makeScreenHash(feedScreen))).toEqual(feedScreen);
    expect(readScreenFromHash(makeScreenHash({ kind: 'bookmarks' }))).toEqual({ kind: 'bookmarks' });
  });
});
