/**
 * Entry 카드 종류. Entry가 무엇을 가리키는지(글, 저장소, 모델, 논문, 릴리스, 채용 공고)에 따라 카드의 메타 줄이 달라진다.
 * 화면이 정하는 값이라 Feed 선언이 아니라 여기에 둔다. 새 Feed가 글이 아니면 이 표에 한 줄을 더한다.
 */

export type CardKind = 'article' | 'repository' | 'model' | 'paper' | 'release' | 'job';

/** Feed id 또는 Feed Group id → 카드 종류. 여기 없는 Feed는 `article`이다. Group으로 적으면 그 Group의 Feed 모두에 쓴다. */
const CARD_KINDS: Record<string, CardKind> = {
  trendshift: 'repository',
  hellogithub: 'repository',
  'hellogithub-ranking': 'repository',
  'openrouter-models': 'model',
  'hf-papers-weekly': 'paper',
  'claude-code-releases': 'release',
  wanted: 'job',
  'jumpit-backend': 'job',
  'saramin-backend': 'job',
  'linkareer-backend': 'job',
};

/**
 * Feed의 카드 종류를 찾는다. Feed id를 먼저 보고, 없으면 Feed Group id를 본다.
 *
 * @param groupId - Feed가 든 Feed Group. 없으면 비운다.
 */
export function findCardKind(feedId: string, groupId?: string): CardKind {
  return CARD_KINDS[feedId] ?? (groupId === undefined ? undefined : CARD_KINDS[groupId]) ?? 'article';
}

/**
 * 순위표에서 직전 수집 대비 증감을 보여 줄 수치 이름. 저장소는 그 기간에 늘어난 스타, 나머지는 점수다.
 * Rank Snapshot의 `metrics`에서 이 이름으로 꺼낸다(ADR-0009).
 */
export function findChangeMetricKey(cardKind: CardKind): string {
  return cardKind === 'repository' ? 'starsGained' : 'score';
}
