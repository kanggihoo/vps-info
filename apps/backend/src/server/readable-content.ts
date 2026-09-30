/**
 * 원문 페이지에서 본문을 뽑아 Markdown으로 돌려준다(ADR-0011). 결과는 저장하지 않는다.
 *
 * 본문 추출은 defuddle(버전 고정), DOM은 linkedom이다. 최신 jsdom과는 추출 결과가 나빠서 쓰지 않는다.
 * 짧거나 엉뚱한 내용이 나와도 그대로 돌려주고, 판정은 사용자에게 맡긴다. 실패는 받지 못했거나 본문이 빈 경우뿐이다.
 */
import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import type { ReaderView } from '@trendboda/api-types';
import { type OriginalPageFetcher, ReaderFailure } from './original-page.ts';
import { isWantedJobUrl, readWantedJob } from './wanted-job-page.ts';

/** defuddle이 빈 값을 `""`로 주므로 `null`로 바꾼다. */
const emptyToNull = (value: string | undefined) => (value?.trim() ? value.trim() : null);

/**
 * 원문 페이지를 가져와 본문을 뽑는다.
 *
 * @param fetchPage - 원문 페이지를 가져오는 함수. 서버는 `fetchOriginalPage`를, 테스트는 가짜를 넣는다.
 * @throws {ReaderFailure} 받지 못했거나(`upstream-status`, `not-html`, 가져오기 단계의 이유들) 뽑은 본문이 비었을 때(`empty`)
 */
export async function readOriginal(url: string, fetchPage: OriginalPageFetcher): Promise<ReaderView> {
  const page = await fetchPage(url);
  if (page.status < 200 || page.status >= 300) throw new ReaderFailure('upstream-status', `원문이 ${page.status}로 응답했습니다`);
  if (page.contentType && !/html/i.test(page.contentType)) throw new ReaderFailure('not-html', `HTML이 아닙니다: ${page.contentType}`);

  // 원티드 공고는 화면을 긁지 않고 페이지에 실린 공고 데이터를 읽는다(ADR-0013).
  if (isWantedJobUrl(page.finalUrl)) return readWantedJob(page.html);

  const { document } = parseHTML(page.html);
  // useAsync: false — X·YouTube 같은 사이트에서 제3자 API를 부르지 않는다.
  const result = await Defuddle(document as unknown as Parameters<typeof Defuddle>[0], page.finalUrl, { markdown: true, useAsync: false });
  const markdown = result.content?.trim() ?? '';
  if (!markdown) throw new ReaderFailure('empty', '원문에서 본문을 찾지 못했습니다');
  return { title: emptyToNull(result.title), markdown, siteName: emptyToNull(result.site), byline: emptyToNull(result.author) };
}
