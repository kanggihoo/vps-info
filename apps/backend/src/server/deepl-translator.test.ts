import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeepLTranslator, TranslationFailure } from './deepl-translator.ts';

/** fetch를 가짜로 바꾸고, 받은 요청을 돌려준다. */
function stubFetch(response: Response) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('createDeepLTranslator', () => {
  it('텍스트 배열과 KO를 인증 헤더와 함께 보내고, 같은 순서로 번역을 돌려준다', async () => {
    const fetchMock = stubFetch(Response.json({ translations: [{ text: '제목' }, { text: '요약' }] }));
    const translated = await createDeepLTranslator('free-key:fx')(['Title', 'Summary']);
    expect(translated).toEqual(['제목', '요약']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect(init?.headers).toMatchObject({ authorization: 'DeepL-Auth-Key free-key:fx' });
    expect(JSON.parse(String(init?.body))).toEqual({ text: ['Title', 'Summary'], target_lang: 'KO' });
  });

  it('무료 키(:fx)가 아니면 유료 주소로 보낸다', async () => {
    const fetchMock = stubFetch(Response.json({ translations: [{ text: '제목' }] }));
    await createDeepLTranslator('pro-key')(['Title']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepl.com/v2/translate');
  });

  it.each([
    [403, 'translation-auth'],
    [456, 'translation-quota'],
    [429, 'translation-busy'],
    [500, 'translation-failed'],
  ])('%i 응답은 %s 실패다', async (status, reason) => {
    stubFetch(new Response(null, { status }));
    const translation = createDeepLTranslator('key:fx')(['Title']);
    await expect(translation).rejects.toBeInstanceOf(TranslationFailure);
    await expect(translation).rejects.toMatchObject({ reason });
  });

  it('보낼 텍스트가 없으면 DeepL을 부르지 않는다', async () => {
    const fetchMock = stubFetch(Response.json({ translations: [] }));
    expect(await createDeepLTranslator('key:fx')([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
