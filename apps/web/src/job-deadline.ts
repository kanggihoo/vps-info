/**
 * 채용 공고 카드의 마감 표기. 마감일이 있으면 `~10/31`, 이미 지났으면 `마감`, 마감일이 없는 상시 채용이면 `상시`다.
 * 화면이 정하는 표기라 Feed 선언이 아니라 여기에 둔다.
 */

/** 한국 시각 기준 오늘 날짜(`YYYY-MM-DD`). 마감일이 한국 날짜 기준이라 시간대를 맞춘다. */
export function getTodayInKorea(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 마감 표기를 만든다. 마감일 당일까지는 아직 진행 중으로 본다.
 *
 * @param deadline - 마감일(`YYYY-MM-DD`). 모르면 비운다.
 * @param alwaysOpen - 상시 채용이라고 정보원이 알린 공고인지
 * @param today - 오늘 날짜(`YYYY-MM-DD`)
 * @returns 보여 줄 게 없으면 `undefined`
 */
export function describeJobDeadline(deadline: string | undefined, alwaysOpen: boolean, today: string): string | undefined {
  if (deadline) {
    if (deadline < today) return '마감';
    const [, month, day] = deadline.split('-');
    return `~${Number(month)}/${Number(day)}`;
  }
  return alwaysOpen ? '상시' : undefined;
}
