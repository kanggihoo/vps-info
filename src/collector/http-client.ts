/**
 * Handler에 주입하는 공통 HTTP 클라이언트(ADR-0009).
 * 타임아웃·재시도 정책은 여기에만 있고, Handler는 이 클라이언트로 자유롭게 호출한다.
 */
import { ofetch } from 'ofetch';

/**
 * 타임아웃 10초, 재시도 2회의 HTTP 클라이언트.
 *
 * 재시도는 네트워크 오류·타임아웃과 408·425·429·5xx 응답에만 한다.
 * 나머지 4xx는 다시 보내도 결과가 같으므로 곧바로 실패로 처리한다.
 * ofetch는 POST를 기본으로 재시도하지 않으므로 `retry`를 명시해 모든 메서드에 적용한다.
 */
export const httpClient = ofetch.create({
  timeout: 10_000,
  retry: 2,
  retryDelay: 1_000,
  retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  headers: { 'User-Agent': 'signal-archive/1.0 (+personal feed reader)' },
});

/** Handler가 받는 HTTP 클라이언트의 타입. 테스트에서는 가짜 구현을 넣는다. */
export type HttpClient = typeof httpClient;
