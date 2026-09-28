/**
 * GitHub Trending 페이지(HTML)에서 저장소 목록을 뽑는 Handler. 공식 API가 없어서 HTML을 읽는다.
 * 순위에 오래 머무는 저장소도 Entry는 처음 올라온 때 하나뿐이다(Dedup Key가 `owner/name`).
 * 비로그인 요청이라 개수가 정해져 있어서 `rankLimit`은 쓰지 않는다(코어가 자른다).
 */
import * as cheerio from 'cheerio';
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

/** "1,234" 같은 숫자 문자열을 숫자로 바꾼다. 숫자가 없으면 `undefined`. */
function parseCount(text: string): number | undefined {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : undefined;
}

/** Trending 페이지 HTML을 EntryDraft 목록으로 바꾼다. 페이지 구조가 바뀌면 여기만 고친다. */
export function parseTrendingPage(html: string) {
  const $ = cheerio.load(html);
  return $('article.Box-row')
    .map((_, element) => {
      const row = $(element);
      const repositoryPath = row.find('h2 a').attr('href');
      if (!repositoryPath) return [];
      const fullName = repositoryPath.slice(1);
      // "2,527 stars today" / "stars this week" / "stars this month"
      const starsInPeriodText = row.find('span:contains("stars ")').last().text();
      const starsInPeriod = parseCount(starsInPeriodText);
      return {
        url: `https://github.com${repositoryPath}`,
        title: fullName,
        externalId: fullName,
        summary: toSummaryText(row.find('p').first().text()),
        extra: { language: row.find('[itemprop="programmingLanguage"]').text().trim() || undefined },
        metrics: {
          score: starsInPeriod,
          starsInPeriod,
          stars: parseCount(row.find(`a[href="${repositoryPath}/stargazers"]`).text()),
        },
        raw: { fullName, starsInPeriodText: starsInPeriodText.trim() },
      };
    })
    .get();
}

export const githubTrendingHandler = defineHandler<{ since: 'daily' | 'weekly' | 'monthly' }>({
  async fetchEntries({ since }, { httpClient }) {
    const html = await httpClient('https://github.com/trending', { query: { since }, responseType: 'text' });
    return parseTrendingPage(html);
  },
});
