/**
 * Entry를 펼친 화면에서 읽기 버튼을 보여 줄지(ADR-0011).
 * 원문 페이지가 본문이 아니라 제품·대시보드 화면인 Feed는 추출해도 쓸모가 없어 버튼을 숨긴다.
 * 화면이 정하는 값이라 Feed 선언이 아니라 여기에 둔다. 새 Feed가 그런 정보원이면 이 목록에 한 줄을 더한다.
 */

/** 읽기 버튼을 숨길 Feed id 또는 Feed Group id. Group으로 적으면 그 Group의 Feed 모두에 쓴다. */
const READER_HIDDEN_IDS = new Set([
  // 원문이 제품 소개·포럼·광고 화면이다.
  'producthunt',
  // 원문이 가격표·가동률 대시보드다.
  'openrouter-models',
]);

/**
 * Feed의 Entry에 읽기 버튼을 보여 줄지 정한다. Feed id를 먼저 보고, 없으면 Feed Group id를 본다.
 *
 * @param groupId - Feed가 든 Feed Group. 없으면 비운다.
 */
export function isReaderAvailable(feedId: string, groupId?: string): boolean {
  return !READER_HIDDEN_IDS.has(feedId) && (groupId === undefined || !READER_HIDDEN_IDS.has(groupId));
}
