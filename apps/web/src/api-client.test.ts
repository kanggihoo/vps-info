import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from './api-client.ts';

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

describe('apiClient 원문 읽기·번역 (ADR-0011)', () => {
  it('번역은 POST로 보내고 번역 결과를 돌려준다', async () => {
    const fetchMock = stubFetch(Response.json({ translatedTitle: '제목', translatedSummary: null }));
    await expect(apiClient.translateEntry(3)).resolves.toEqual({ translatedTitle: '제목', translatedSummary: null });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/entries/3/translation');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('실패 응답의 reason을 ApiError에 담는다', async () => {
    stubFetch(Response.json({ message: '한도 초과', reason: 'translation-quota' }, { status: 502 }));
    await expect(apiClient.translateEntry(3)).rejects.toMatchObject({ status: 502, reason: 'translation-quota' });
    stubFetch(Response.json({ message: '막힘', reason: 'upstream-status' }, { status: 502 }));
    await expect(apiClient.readOriginal(3)).rejects.toBeInstanceOf(ApiError);
  });

  it('JSON이 아닌 실패 응답은 reason 없이 던진다', async () => {
    stubFetch(new Response('Bad Gateway', { status: 502 }));
    await expect(apiClient.readOriginal(3)).rejects.toMatchObject({ status: 502, reason: undefined });
  });

  it('관리 요청의 안내 문구를 표시하고 비어 있는 JSON 오류도 기본 안내로 처리한다', async () => {
    stubFetch(Response.json({ message: '이미 수집 요청이 대기 중입니다.' }, { status: 409 }));
    await expect(apiClient.requestFeedFetch('geeknews')).rejects.toThrow('이미 수집 요청이 대기 중입니다.');
    stubFetch(Response.json(null, { status: 502 }));
    await expect(apiClient.getAdminOverview()).rejects.toMatchObject({ status: 502 });
  });
});
