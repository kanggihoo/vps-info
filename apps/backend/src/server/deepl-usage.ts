/** DeepL 공식 usage API를 읽는다. 계정 사용량을 앱 자체 사용량으로 바꾸어 표시하지 않는다(ADR-0017). */
import type { DeepLUsageView } from '@trendboda/api-types';

/** 서버 환경의 API 키로 사용량을 조회한다. 키는 응답이나 오류 메시지에 포함하지 않는다. */
export async function fetchDeepLUsage(apiKey: string, request: typeof fetch = fetch): Promise<DeepLUsageView> {
  const baseUrl = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const response = await request(`${baseUrl}/v2/usage`, {
    headers: { authorization: `DeepL-Auth-Key ${apiKey}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'DeepL API 키를 확인하세요.' : `DeepL 사용량 조회 실패: HTTP ${response.status}`);
  const usage: unknown = await response.json();
  if (!usage || typeof usage !== 'object') throw new Error('DeepL 사용량 응답을 읽지 못했습니다.');
  const fields = usage as Record<string, unknown>;
  const readCount = (name: string, optional = false): number | null => {
    const value = fields[name];
    if (optional && value === undefined) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('DeepL 사용량 응답을 읽지 못했습니다.');
    return value;
  };
  const readLimit = (name: string, optional = false) => {
    const value = readCount(name, optional);
    return value === 1_000_000_000_000 ? null : value;
  };
  return {
    characterCount: readCount('character_count')!, characterLimit: readLimit('character_limit'),
    apiKeyCharacterCount: readCount('api_key_character_count', true), apiKeyCharacterLimit: readLimit('api_key_character_limit', true),
    periodStart: typeof fields.start_time === 'string' ? fields.start_time : null,
    periodEnd: typeof fields.end_time === 'string' ? fields.end_time : null,
    checkedAt: new Date().toISOString(),
  };
}
