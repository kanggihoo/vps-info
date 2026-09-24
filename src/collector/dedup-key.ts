/** Dedup Key 계산(ADR-0005). 같은 Feed 안에서 두 Entry가 같은 항목인지 판정하는 값이다. */
import { createHash } from 'node:crypto';

/** 추적용이라 같은 글을 가리키는 데 영향이 없는 쿼리 파라미터의 접두사. */
const TRACKING_PARAMETER_PREFIXES = ['utm_', 'fbclid', 'gclid', 'ref'];

/**
 * 같은 글을 가리키는 URL이 같은 문자열이 되도록 정규화한다.
 * 프래그먼트와 추적용 쿼리 파라미터를 지우고, 남은 쿼리 파라미터를 이름순으로 정렬한다.
 * 스킴과 호스트의 대소문자는 `URL`이 알아서 소문자로 맞춘다.
 */
export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  for (const name of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMETER_PREFIXES.some((prefix) => name.startsWith(prefix))) parsed.searchParams.delete(name);
  }
  parsed.searchParams.sort();
  return parsed.toString();
}

/**
 * Entry의 Dedup Key를 만든다.
 *
 * @param entry.externalId - 정보원이 준 고유 식별자. 있으면 그대로 쓴다.
 * @param entry.url - 고유 식별자가 없을 때 정규화한 뒤 해시한다.
 * @returns `ext:<식별자>` 또는 `url:<sha256>`. 접두사가 있어서 두 방식의 값이 서로 겹치지 않는다.
 */
export function makeDedupKey(entry: { externalId?: string; url: string }): string {
  if (entry.externalId) return `ext:${entry.externalId}`;
  return `url:${createHash('sha256').update(normalizeUrl(entry.url)).digest('hex')}`;
}
