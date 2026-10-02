/** 공통 배치를 불러오고, 이동 완료 시 저장한다. 실패하면 직전 저장값으로 복구한다(ADR-0016). */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedNavigationOrder } from '@trendboda/api-types';
import { ApiError, apiClient } from './api-client.ts';

/** 조회 실패 재시도와 저장 상태를 사이드바·첫 화면 선택에 제공한다. */
export function useFeedNavigationOrder() {
  const [order, setOrder] = useState<FeedNavigationOrder>();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const lastSavedRef = useRef<FeedNavigationOrder | undefined>(undefined);
  const retryOrderRef = useRef<FeedNavigationOrder | undefined>(undefined);
  const reload = useCallback(async () => {
    if (savingRef.current) return;
    setFailed(false);
    try {
      const loaded = await apiClient.getFeedNavigationOrder();
      lastSavedRef.current = loaded;
      retryOrderRef.current = undefined;
      setOrder(loaded);
      setMessage('');
    } catch {
      setFailed(true);
      setMessage('Feed 순서를 불러오지 못했습니다.');
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const save = useCallback(async (next: FeedNavigationOrder) => {
    if (savingRef.current) return;
    const previous = lastSavedRef.current;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    setOrder(next);
    setMessage('순서를 저장하는 중입니다.');
    try {
      const saved = await apiClient.saveFeedNavigationOrder(next);
      lastSavedRef.current = saved;
      retryOrderRef.current = undefined;
      setOrder(saved);
      setMessage('순서를 저장했습니다.');
    } catch (error) {
      setOrder(previous);
      setFailed(true);
      retryOrderRef.current = error instanceof ApiError && error.status === 409 ? undefined : next;
      setMessage(error instanceof ApiError && error.status === 409
        ? 'Feed 목록이 바뀌었습니다. 목록을 다시 불러오세요.'
        : '순서를 저장하지 못해 이전 순서로 되돌렸습니다.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);
  const retry = () => retryOrderRef.current ? void save(retryOrderRef.current) : void reload();
  return { order, saving, failed, message, save, retry };
}
