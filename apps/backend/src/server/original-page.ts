/**
 * Entry의 원문 페이지를 가져온다(ADR-0011). 원문 읽기에만 쓰고 수집기는 쓰지 않는다.
 *
 * 수집기의 ofetch 클라이언트(Node `fetch`)는 OpenAI처럼 Cloudflare가 지키는 사이트에서 403을 받는다.
 * undici `request`에 브라우저와 비슷한 헤더를 붙이면 통과한다(2026-09-29 확인). 그래서 따로 둔다.
 * 원문 주소는 누구나 올린 HN 링크일 수 있어서, 내부망 주소로는 연결하지 않는다.
 */
import { lookup as lookupDns } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent, request } from 'undici';
import type { ReaderFailureReason } from '@trendboda/api-types';

/** 원문 페이지 전체를 받기까지 기다리는 시간. Indie Hackers는 첫 바이트까지 6~7초 걸린다. */
const TIMEOUT_MILLISECONDS = 15_000;
/** 받을 HTML의 최대 크기. 넘으면 끊는다. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** 따라가는 리다이렉트 수. */
const MAX_REDIRECTS = 5;

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

/** 가져온 원문 페이지. 상태 코드와 내용 종류는 판정하지 않고 그대로 돌려준다. */
export type OriginalPage = {
  status: number;
  /** `content-type` 헤더. 없으면 빈 문자열. */
  contentType: string;
  html: string;
  /** 리다이렉트를 따라간 뒤의 주소. 본문의 상대 링크를 풀 때 기준이 된다. */
  finalUrl: string;
};

/** 원문 페이지를 가져오는 함수. 테스트에서는 가짜로 바꿔 넣는다. */
export type OriginalPageFetcher = (url: string) => Promise<OriginalPage>;

/** 원문 읽기가 실패한 이유를 담은 오류. 서버는 이 이유를 502 응답의 `reason`으로 돌려준다. */
export class ReaderFailure extends Error {
  readonly reason: ReaderFailureReason;

  constructor(reason: ReaderFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** 연결하지 않을 내부망·루프백·링크 로컬 주소. */
const privateAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const) {
  privateAddresses.addSubnet(network, prefix, 'ipv4');
}
privateAddresses.addAddress('::1', 'ipv6');
privateAddresses.addSubnet('fc00::', 7, 'ipv6');
privateAddresses.addSubnet('fe80::', 10, 'ipv6');

const isPrivateAddress = (address: string, family: number) => privateAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4');

/** DNS로 찾은 주소가 내부망이면 연결을 거부한다. 이름을 풀고 난 뒤에 검사해야 내부망을 가리키는 도메인도 막힌다. */
const lookupPublicAddress: LookupFunction = (hostname, options, callback) => {
  lookupDns(hostname, options, (error, address, family) => {
    if (error) return callback(error, address, family);
    const resolved = typeof address === 'string' ? [{ address, family: family ?? 4 }] : address;
    if (resolved.some((candidate) => isPrivateAddress(candidate.address, candidate.family))) {
      return callback(Object.assign(new Error(`내부망 주소입니다: ${hostname}`), { code: 'EPRIVATEADDRESS' }), address, family);
    }
    callback(null, address, family);
  });
};

const dispatcher = new Agent({ connect: { lookup: lookupPublicAddress } });

/** http·https이고 IP로 적힌 내부망 주소가 아닌지 확인한다. IP로 적힌 주소는 DNS를 거치지 않아 여기서 막는다. */
function assertFetchableUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ReaderFailure('unreachable', `http(s) 주소가 아닙니다: ${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(host);
  if (host === 'localhost' || (family !== 0 && isPrivateAddress(host, family))) throw new ReaderFailure('unreachable', `내부망 주소입니다: ${host}`);
}

/** `content-type`의 charset으로 본문을 글자로 바꾼다. 모르는 charset이면 UTF-8로 읽는다. */
function decodeBody(bytes: Buffer, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** 응답 본문을 최대 크기까지만 읽는다. 넘으면 스트림을 끊고 `too-large`로 실패한다. */
async function readLimitedBody(body: AsyncIterable<Buffer> & { destroy: () => void }, contentLength: number): Promise<Buffer> {
  if (contentLength > MAX_BODY_BYTES) {
    body.destroy();
    throw new ReaderFailure('too-large', `원문이 너무 큽니다: ${contentLength}바이트`);
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of body) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      body.destroy();
      throw new ReaderFailure('too-large', `원문이 ${MAX_BODY_BYTES}바이트를 넘습니다`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * 원문 페이지를 가져온다. 리다이렉트는 직접 따라가며 매번 주소를 검사한다.
 *
 * @throws {ReaderFailure} 타임아웃(`timeout`), 5MB 초과(`too-large`), 연결 실패·내부망 주소(`unreachable`)
 */
export const fetchOriginalPage: OriginalPageFetcher = async (url) => {
  const signal = AbortSignal.timeout(TIMEOUT_MILLISECONDS);
  let currentUrl = new URL(url);
  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      assertFetchableUrl(currentUrl);
      const response = await request(currentUrl, { dispatcher, headers: BROWSER_HEADERS, signal });
      const location = response.headers.location;
      if (response.statusCode >= 300 && response.statusCode < 400 && typeof location === 'string') {
        response.body.destroy();
        if (redirectCount >= MAX_REDIRECTS) throw new ReaderFailure('unreachable', `리다이렉트가 ${MAX_REDIRECTS}번을 넘습니다`);
        currentUrl = new URL(location, currentUrl);
        continue;
      }
      const contentType = String(response.headers['content-type'] ?? '');
      const bytes = await readLimitedBody(response.body, Number(response.headers['content-length'] ?? 0));
      return { status: response.statusCode, contentType, html: decodeBody(bytes, contentType), finalUrl: currentUrl.href };
    }
  } catch (error) {
    if (error instanceof ReaderFailure) throw error;
    if (signal.aborted) throw new ReaderFailure('timeout', `${TIMEOUT_MILLISECONDS / 1000}초 안에 원문을 받지 못했습니다`);
    throw new ReaderFailure('unreachable', `원문에 연결하지 못했습니다: ${String(error)}`);
  }
};
