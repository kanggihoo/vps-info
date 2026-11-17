/** 브라우저 전송을 쓰더라도 공통 HTTP 재시도·취소와 다른 정보원의 경로가 유지되는지 검사한다. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetch as browserFetch } from 'impers';
import { fetchCollectorResource } from './collector-fetch.ts';
import { httpClient } from './http-client.ts';

vi.mock('impers', () => ({ fetch: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(browserFetch).mockReset(); });

const INDIE_HACKERS_URL = 'https://www.indiehackers.com/top/week-of-2026-11-09';

describe('fetchCollectorResource', () => {
  it('Indie Hackers만 Chrome 지문으로 보내고 응답을 공통 클라이언트가 읽는다', async () => {
    vi.mocked(browserFetch).mockResolvedValue(new Response('<html>목록</html>'));
    const signal = new AbortController().signal;
    const result = await httpClient(INDIE_HACKERS_URL, { responseType: 'text', signal });
    expect(result).toBe('<html>목록</html>');
    const [url, options] = vi.mocked(browserFetch).mock.calls[0];
    expect(url).toBe(INDIE_HACKERS_URL);
    expect(options).toMatchObject({ impersonate: 'chrome', timeout: 10, signal });
    expect(new Headers(options?.headers).has('user-agent')).toBe(false);
  });

  it.each(['https://www.wanted.co.kr/api/jobs', 'https://www.indiehackers.com.example.com/', 'http://www.indiehackers.com/'])('다른 origin은 Node fetch와 원래 옵션을 유지한다: %s', async (url) => {
    const response = new Response('native');
    const nativeFetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', nativeFetch);
    const options = { headers: { 'user-agent': 'trendboda/1.0' } };
    expect(await fetchCollectorResource(url, options)).toBe(response);
    expect(nativeFetch).toHaveBeenCalledWith(url, options);
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it('503은 기존 정책대로 두 번 재시도한다', async () => {
    vi.mocked(browserFetch).mockImplementation(async () => new Response('unavailable', { status: 503 }));
    await expect(httpClient(INDIE_HACKERS_URL, { retryDelay: 0 })).rejects.toThrow();
    expect(browserFetch).toHaveBeenCalledTimes(3);
  });

  it('403은 재시도하지 않는다', async () => {
    vi.mocked(browserFetch).mockResolvedValue(new Response('blocked', { status: 403 }));
    await expect(httpClient(INDIE_HACKERS_URL, { retryDelay: 0 })).rejects.toThrow();
    expect(browserFetch).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류도 재시도한다', async () => {
    vi.mocked(browserFetch).mockRejectedValue(new TypeError('connection reset'));
    await expect(httpClient(INDIE_HACKERS_URL, { retryDelay: 0 })).rejects.toThrow();
    expect(browserFetch).toHaveBeenCalledTimes(3);
  });
});
