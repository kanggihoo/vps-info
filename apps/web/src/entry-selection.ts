/** 가운데 목록에서 Entry를 골라 오른쪽에 펼칠 때 목록이 넘겨주는 것(ADR-0011). */
import type { EntryView, RankedEntryView } from '@trendboda/api-types';

/** 목록이 이미 가진 Entry를 넘겨 펼친 화면이 다시 조회하지 않게 한다. 화면 주소로 바로 연 경우에는 없다. */
export type EntrySelection = {
  entry: EntryView;
  /** Ranked Feed 순위표에서 골랐을 때의 순위와 변동. */
  rankedEntry?: RankedEntryView;
  /** 대표 수치의 직전 수집 대비 증감(Ranked Feed). */
  metricChange?: number;
};

/** 가운데 목록(타임라인, 순위표, Bookmark 목록)이 공통으로 받는 선택 관련 값. */
export type EntrySelectionProps = {
  /** 지금 오른쪽에 펼친 Entry. */
  selectedEntryId: number | undefined;
  /** Entry를 펼친 화면의 해시. 카드 링크의 주소가 된다. */
  makeEntryHref: (entryId: number) => string;
  /** 카드를 눌러 Entry를 펼칠 때 부른다. */
  onSelectEntry: (selection: EntrySelection) => void;
};
