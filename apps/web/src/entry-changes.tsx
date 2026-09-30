/**
 * 화면 여러 곳에 동시에 보이는 Entry의 읽기 상태를 맞춘다.
 *
 * 같은 Entry가 가운데 목록의 카드와 오른쪽 펼친 화면에 함께 보인다. 한쪽에서 Opened At·Bookmark·번역이 바뀌면
 * 다른 쪽도 바로 바뀌어야 한다. 원문을 읽다가 찾은 채용 공고의 마감일(`extra.deadline`)도 여기로 알린다. 목록마다 자기 Entry 상태를 들고 있으므로, 바뀐 값만 여기에 모아 두고 그릴 때 덮어쓴다.
 * 서버에 저장한 뒤의 값이라 새로고침하면 서버 응답이 같은 값을 준다.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { EntryView } from '@trendboda/api-types';

/** 화면에서 바뀔 수 있는 Entry 필드. */
type EntryChange = Pick<EntryView, 'openedAt' | 'bookmarkedAt' | 'translatedTitle' | 'translatedSummary' | 'extra'>;

type EntryChangesValue = {
  changesById: ReadonlyMap<number, EntryChange>;
  publishChange: (changedEntry: EntryView) => void;
};

const EntryChangesContext = createContext<EntryChangesValue | undefined>(undefined);

/** 앱 전체를 감싼다. */
export function EntryChangesProvider({ children }: { children: ReactNode }) {
  const [changesById, setChangesById] = useState<ReadonlyMap<number, EntryChange>>(new Map());
  const publishChange = useCallback((changedEntry: EntryView) => {
    const { openedAt, bookmarkedAt, translatedTitle, translatedSummary, extra } = changedEntry;
    setChangesById((current) => new Map(current).set(changedEntry.id, { openedAt, bookmarkedAt, translatedTitle, translatedSummary, extra }));
  }, []);
  const value = useMemo(() => ({ changesById, publishChange }), [changesById, publishChange]);
  return <EntryChangesContext value={value}>{children}</EntryChangesContext>;
}

/**
 * @returns `withChanges`: Entry에 화면에서 바뀐 값을 덮어 돌려준다. `publishChange`: 저장을 마친 Entry를 알린다.
 */
export function useEntryChanges() {
  const context = useContext(EntryChangesContext);
  if (!context) throw new Error('EntryChangesProvider 안에서 써야 합니다');
  const { changesById, publishChange } = context;
  const withChanges = useCallback(
    <Entry extends EntryView>(entry: Entry): Entry => {
      const change = changesById.get(entry.id);
      return change ? { ...entry, ...change } : entry;
    },
    [changesById],
  );
  return { withChanges, publishChange };
}
