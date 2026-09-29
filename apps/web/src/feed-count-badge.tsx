/** Feed의 안 읽음 수(Stream Feed) 또는 최신 Rank Snapshot의 NEW 수(Ranked Feed) 배지. 왼쪽 목록과 Feed Group 탭이 함께 쓴다. */
import type { FeedSummary } from '@trendboda/api-types';
import { Badge } from '@/components/ui/badge';

export function FeedCountBadge({ feed }: { feed: FeedSummary }) {
  if (feed.kind === 'stream' && feed.unreadCount > 0)
    return (
      <Badge className="shrink-0 rounded-full bg-brand px-2 font-mono text-numeric-badge tabular-nums text-brand-foreground">
        {feed.unreadCount}
        <span className="sr-only">개 안 읽음</span>
      </Badge>
    );
  // 안 읽음 수와 달리 열어 봐도 줄지 않으므로 속이 빈 알약으로 구분한다(ADR-0009).
  if (feed.kind === 'ranked' && feed.rankSnapshotNewCount > 0)
    return (
      <Badge variant="outline" className="shrink-0 rounded-full border-brand px-2 font-mono text-numeric-badge tabular-nums text-brand-ink">
        NEW {feed.rankSnapshotNewCount}
        <span className="sr-only">개가 최근 수집에서 순위에 새로 들어옴</span>
      </Badge>
    );
  return null;
}

/** 드롭다운 선택지처럼 글자만 쓸 수 있는 곳의 같은 표시. 셀 것이 없으면 빈 문자열이다. */
export function formatFeedCount(feed: FeedSummary): string {
  if (feed.kind === 'stream') return feed.unreadCount > 0 ? ` · 안 읽음 ${feed.unreadCount}` : '';
  return feed.rankSnapshotNewCount > 0 ? ` · NEW ${feed.rankSnapshotNewCount}` : '';
}
