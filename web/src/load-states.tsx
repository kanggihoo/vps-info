/** 목록을 불러오는 동안·실패했을 때·비었을 때 보여 주는 화면 조각(web/DESIGN.md의 로딩·오류·빈 상태). */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** 불러오는 동안 보여 줄 Entry 카드 수. */
const SKELETON_ENTRY_COUNT = 5;

/** Entry 카드 모양 그대로의 자리 표시. 스피너 대신 쓴다. */
export function EntryListSkeleton() {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-2 p-4" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: SKELETON_ENTRY_COUNT }, (_, index) => (
        <div key={index} className="rounded-lg border bg-card px-4 py-3">
          <Skeleton className="h-5 w-3/4 rounded-xs" />
          <Skeleton className="mt-2 h-3.5 w-1/3 rounded-xs" />
          <Skeleton className="mt-3 h-3.5 w-full rounded-xs" />
          <Skeleton className="mt-1.5 h-3.5 w-5/6 rounded-xs" />
        </div>
      ))}
    </div>
  );
}

/** 요청이 실패한 영역 안에 한 줄로 알리고 다시 시도하게 한다. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mt-20 flex flex-col items-center gap-3 px-4 text-center">
      <p className="text-caption text-destructive">{message}</p>
      <Button variant="outline" size="sm" className="rounded-full px-4" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

/** 빈 목록. `children`에는 다음에 무슨 일이 일어나는지를 쓴다. */
export function EmptyMessage({ children }: { children: ReactNode }) {
  return <p className="mt-20 px-4 text-center text-body-sm text-muted-foreground">{children}</p>;
}
