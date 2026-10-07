/**
 * Star History(star-history.com) 홈의 주간 급상승 저장소 순위표를 가져오는 Handler.
 * 공식 API가 없어서 홈 HTML에 미리 그려진 순위표(`<ol>`)를 읽는다. 클래스 이름은 Tailwind 유틸리티라 읽지 않는다.
 *
 * - 한 줄(`li`)의 링크(`a[href]`)가 `/owner/repo`(소문자)이고, 그 안의 순위 칸·변동 칸·`+8.8k` 칸이 차례로 있다.
 * - 정확한 `owner/repo`(대소문자)와 `+8,835`는 같은 `li` 안의 마우스 올림 설명(`span`)에만 있다.
 * - 사이트가 보여 주는 순위 변동(▲ 3, ▼ 1, N)은 지난주 대비라서 `metrics`에 따로 남긴다.
 */
import * as cheerio from 'cheerio';
import { defineHandler, type EntryDraft } from './define-handler.ts';

const HOME_URL = 'https://www.star-history.com/';

/** 마우스 올림 설명 `owner/repo +8,835`. React가 넣은 주석은 텍스트에 나오지 않는다. */
const TOOLTIP_PATTERN = /^(\S+\/\S+)\s+\+?([\d,]+)$/;

/** 변동 칸의 `title`: `Up 3`, `Down 10`, `New to top 20`. 변동이 없으면 `title`이 없다. */
const MOVEMENT_PATTERN = /^(Up|Down) (\d+)$/;

/**
 * 홈 HTML을 순위순 EntryDraft 목록으로 바꾼다. 순위표를 찾지 못하거나 한 줄이라도 형식이 다르면 예외를 던져
 * Fetch Attempt를 실패로 남긴다(구조가 바뀐 것을 조용히 넘기지 않는다).
 */
export function parseStarHistoryHome(html: string): EntryDraft[] {
  const $ = cheerio.load(html);
  const rows = $('ol > li:has(a[href])').toArray();
  if (rows.length === 0) throw new Error('Star History 홈에서 순위표를 찾지 못했다. 페이지 구조가 바뀌었는지 확인한다.');

  return rows.map((row) => {
    const item = $(row);
    const link = item.find('a[href]').first();
    const rank = Number(link.children('span').first().text().trim());
    const tooltip = TOOLTIP_PATTERN.exec(item.children('span').last().text().trim());
    if (!Number.isInteger(rank) || !tooltip) throw new Error(`Star History 순위 한 줄을 읽지 못했다: ${item.text().trim().slice(0, 80)}`);

    const [, fullName, gained] = tooltip;
    const movementTitle = link.find('span[title]').first().attr('title') ?? '';
    const movement = MOVEMENT_PATTERN.exec(movementTitle);
    return {
      url: `https://github.com/${fullName}`,
      title: fullName,
      externalId: fullName,
      author: fullName.split('/')[0],
      metrics: {
        starsGained: Number(gained.replaceAll(',', '')),
        // 지난주보다 오른 칸 수(내려가면 음수). 새로 들어왔거나 그대로면 비운다.
        rankChange: movement ? (movement[1] === 'Up' ? 1 : -1) * Number(movement[2]) : undefined,
        isNewToTop: movementTitle.startsWith('New') || undefined,
      },
      raw: { rank, fullName, gained, movementTitle },
    };
  });
}

export const starhistoryHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    return parseStarHistoryHome(await httpClient(HOME_URL, { responseType: 'text' }));
  },
});
