/**
 * 원티드는 해외 IP(VPS)를 CloudFront가 403으로 막는다. 그래서 원티드로 가는 요청만 한국 IP에서 나가는 프록시로 보낸다.
 * `WANTED_PROXY_URL`이 비어 있으면 프록시 없이 직접 나간다. 프록시 구성은 docs/sources/wanted.md에 있다.
 */
import { ProxyAgent } from 'undici';

const WANTED_HOST = 'www.wanted.co.kr';

/** 프록시 주소가 있을 때만 만든다. 원티드 요청의 `dispatcher`로 넘긴다. */
export const wantedProxyAgent = process.env.WANTED_PROXY_URL ? new ProxyAgent(process.env.WANTED_PROXY_URL) : undefined;

/** 프록시를 거쳐야 하는 주소인지. 호스트가 정확히 일치할 때만 참이라, 다른 사이트 요청은 프록시로 새지 않는다. */
export const isWantedUrl = (url: URL) => url.hostname === WANTED_HOST;
