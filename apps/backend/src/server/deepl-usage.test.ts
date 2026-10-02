import { describe, expect, it, vi } from 'vitest';
import { fetchDeepLUsage } from './deepl-usage.ts';

describe('DeepL usage', () => {
  it('무료 주소로 요청하고 계정과 키 사용량을 구별한다', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ character_count: 123, character_limit: 500000 }));
    expect(await fetchDeepLUsage('test:fx', request)).toMatchObject({ characterCount: 123, characterLimit: 500000, apiKeyCharacterCount: null });
    expect(request.mock.calls[0][0]).toBe('https://api-free.deepl.com/v2/usage');
    expect(request.mock.calls[0][1]?.headers).toEqual({ authorization: 'DeepL-Auth-Key test:fx' });
  });
  it('키별 사용량과 무제한 및 과금 기간을 읽는다', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ character_count: 200, character_limit: 1e12,
      api_key_character_count: 100, api_key_character_limit: 1000, start_time: '2026-10-01T00:00:00Z', end_time: '2026-11-01T00:00:00Z' }));
    expect(await fetchDeepLUsage('test', request)).toMatchObject({ characterLimit: null, apiKeyCharacterCount: 100, apiKeyCharacterLimit: 1000,
      periodStart: '2026-10-01T00:00:00Z' });
    expect(request.mock.calls[0][0]).toBe('https://api.deepl.com/v2/usage');
  });
  it('키와 잘못된 응답을 노출하지 않는다', async () => {
    await expect(fetchDeepLUsage('secret', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 403 })))).rejects.toThrow('API 키를 확인');
    await expect(fetchDeepLUsage('secret', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ character_count: '123' })))).rejects.toThrow('응답');
  });
});
