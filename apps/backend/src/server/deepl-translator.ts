/**
 * DeepL로 텍스트를 한국어로 번역한다(ADR-0011). 브라우저에서는 DeepL을 부를 수 없어 서버가 부른다.
 *
 * 쓰는 기능이 `/v2/translate` 하나라 공식 SDK 대신 HTTP 요청 하나로 부른다.
 * 목록 제목 자동 번역(ADR-0012, 제안)을 만들 때도 같은 함수를 쓴다.
 */
import type { TranslationFailureReason } from '@trendboda/api-types';

/** DeepL 한 요청에 담을 수 있는 텍스트 수. */
const MAX_TEXTS_PER_REQUEST = 50;
const TIMEOUT_MILLISECONDS = 10_000;

/** 텍스트 목록을 받아 같은 순서의 번역 목록을 돌려주는 함수. 테스트에서는 가짜로 바꿔 넣는다. */
export type TextTranslator = (texts: string[]) => Promise<string[]>;

/** 번역이 실패한 이유를 담은 오류. 서버는 이 이유를 응답의 `reason`으로 돌려준다. */
export class TranslationFailure extends Error {
  readonly reason: TranslationFailureReason;

  constructor(reason: TranslationFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

type DeepLTranslateResponse = { translations: { text: string }[] };

/** DeepL 응답 상태를 실패 이유로 바꾼다. 403 키 오류, 456 월 한도 초과, 429 요청 과다. */
function toFailureReason(status: number): TranslationFailureReason {
  if (status === 403) return 'translation-auth';
  if (status === 456) return 'translation-quota';
  if (status === 429) return 'translation-busy';
  return 'translation-failed';
}

/**
 * DeepL 번역 함수를 만든다. 무료 키(`:fx`로 끝남)는 무료 주소로, 나머지는 유료 주소로 보낸다.
 *
 * @param apiKey - `DEEPL_API_KEY` 환경 변수 값
 */
export function createDeepLTranslator(apiKey: string): TextTranslator {
  const baseUrl = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

  return async (texts) => {
    if (texts.length === 0) return [];
    if (texts.length > MAX_TEXTS_PER_REQUEST) throw new TranslationFailure('translation-failed', `한 번에 ${MAX_TEXTS_PER_REQUEST}개까지 번역합니다`);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v2/translate`, {
        method: 'POST',
        headers: { authorization: `DeepL-Auth-Key ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: texts, target_lang: 'KO' }),
        signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      throw new TranslationFailure('translation-failed', `DeepL에 연결하지 못했습니다: ${String(error)}`);
    }
    if (!response.ok) throw new TranslationFailure(toFailureReason(response.status), `DeepL이 ${response.status}로 응답했습니다`);
    const { translations } = (await response.json()) as DeepLTranslateResponse;
    return translations.map((translation) => translation.text);
  };
}
