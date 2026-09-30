import { describe, expect, it } from 'vitest';
import { makeScreenHash, readScreenFromHash } from './screen-route.ts';

describe('screen-route', () => {
  it('해시를 화면으로 해석한다', () => {
    expect(readScreenFromHash('#/feeds/hn-best')).toEqual({ kind: 'feed', feedId: 'hn-best' });
    expect(readScreenFromHash('#/bookmarks')).toEqual({ kind: 'bookmarks' });
    expect(readScreenFromHash('')).toEqual({ kind: 'none' });
    expect(readScreenFromHash('#/unknown')).toEqual({ kind: 'none' });
  });

  it('펼친 Entry를 해석한다', () => {
    expect(readScreenFromHash('#/feeds/hn-best/entries/12')).toEqual({ kind: 'feed', feedId: 'hn-best', entryId: 12 });
    expect(readScreenFromHash('#/bookmarks/entries/3')).toEqual({ kind: 'bookmarks', entryId: 3 });
  });

  it('잘못된 Entry id는 무시하고 Feed 화면으로 본다', () => {
    expect(readScreenFromHash('#/feeds/hn-best/entries/abc')).toEqual({ kind: 'feed', feedId: 'hn-best' });
    expect(readScreenFromHash('#/feeds/hn-best/entries/0')).toEqual({ kind: 'feed', feedId: 'hn-best' });
    expect(readScreenFromHash('#/bookmarks/entries/')).toEqual({ kind: 'bookmarks' });
  });

  it('만든 해시를 다시 읽으면 같은 화면이 된다', () => {
    const feedScreen = { kind: 'feed', feedId: 'youtube/채널 1' } as const;
    expect(readScreenFromHash(makeScreenHash(feedScreen))).toEqual(feedScreen);
    expect(readScreenFromHash(makeScreenHash({ kind: 'bookmarks' }))).toEqual({ kind: 'bookmarks' });
    const entryScreen = { kind: 'feed', feedId: 'youtube/채널 1', entryId: 7 } as const;
    expect(readScreenFromHash(makeScreenHash(entryScreen))).toEqual(entryScreen);
    expect(readScreenFromHash(makeScreenHash({ kind: 'bookmarks', entryId: 9 }))).toEqual({ kind: 'bookmarks', entryId: 9 });
  });
});
