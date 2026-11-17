/** HTTP 정책은 ofetch에 두고, Indie Hackers 요청에만 브라우저 TLS 지문을 적용한다(ADR-0006, #18). */

/**
 * 공통 클라이언트의 fetch 구현. 다른 정보원은 Node fetch와 기존 dispatcher를 그대로 사용한다.
 * impers는 지연 import하므로 다른 Feed와 API 서버는 native library를 로드하지 않는다.
 */
export async function fetchCollectorResource(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== 'https://www.indiehackers.com') return globalThis.fetch(input, init);

  const { fetch: browserFetch } = await import('impers');
  // TLS 지문과 User-Agent가 다른 클라이언트로 보이지 않도록 Chrome 기본 헤더를 사용한다.
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.delete('user-agent');
  return browserFetch(input, { ...init, headers, impersonate: 'chrome', timeout: 10 });
}
