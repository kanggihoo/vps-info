import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client.ts';

/** fetch를 가짜로 바꾸고, 받은 요청을 돌려준다. */
function stubFetch(response: Response) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('apiClient', () => {
  it('Entry 조회는 Feed id를 인코딩하고 after·limit을 붙인다', async () => {
    const fetchMock = stubFetch(Response.json([]));
    await apiClient.listEntriesAfter('a/b', 10, 50);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/feeds/a%2Fb/entries?after=10&limit=50');
  });

  it('Read Cursor 이동은 페이지를 떠나도 끝나도록 keepalive PUT으로 보낸다', async () => {
    const fetchMock = stubFetch(Response.json({ readCursorEntryId: 5 }));
    await apiClient.moveReadCursor('hn-best', 5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/feeds/hn-best/read-cursor');
    expect(init).toMatchObject({ method: 'PUT', keepalive: true, body: JSON.stringify({ entryId: 5 }) });
  });

  it('204 응답은 본문 없이 끝나고, 실패 응답은 예외를 던진다', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiClient.setBookmarked(1, true)).resolves.toBeUndefined();
    stubFetch(new Response(null, { status: 404 }));
    await expect(apiClient.markOpened(1)).rejects.toThrow('404');
  });
});
