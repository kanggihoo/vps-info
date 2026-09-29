/**
 * 왼쪽 Feed 목록. Feed마다 안 읽음 수(Ranked Feed는 NEW 수)와 연속 실패 경고를 보여 주고, 아래쪽에 Bookmark와 테마 토글을 둔다.
 * 768px 미만에서는 위쪽 가로 탭 줄이 되고, 그 줄 안에서만 가로로 스크롤한다(DESIGN.md).
 */
import { Moon, Star, Sun, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FeedSummary } from '@trendboda/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from 'cn';
import { makeScreenHash, type Screen } from './screen-route.ts';
import { useColorTheme } from './use-color-theme.ts';

const nextRunFormatter = new Intl.DateTimeFormat('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

type FeedSidebarProps = {
  feeds: FeedSummary[];
  screen: Screen;
};

export function FeedSidebar({ feeds, screen }: FeedSidebarProps) {
  const { colorTheme, toggleColorTheme } = useColorTheme();

  return (
    <nav
      className={cn(
        // relative: sr-only(absolute) 글자가 페이지 기준으로 놓여 가로 스크롤을 만들지 않게 이 줄 안에 가둔다.
        'relative flex gap-1 overflow-x-auto border-b border-sidebar-border bg-sidebar p-2 max-md:[scrollbar-width:none]',
        'md:flex-col md:gap-0 md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:p-3',
      )}
    >
      <h1 className="hidden px-3 pt-1 pb-4 text-app-title text-foreground md:block">Trendboda</h1>
      <ul className="flex gap-1 md:mb-3 md:flex-col">
        {feeds.map((feed) => (
          <li key={feed.id}>
            <FeedLink feed={feed} selected={screen.kind === 'feed' && screen.feedId === feed.id} />
          </li>
        ))}
      </ul>
      <div className="flex gap-1 md:mt-auto md:flex-col">
        <SidebarLink href={makeScreenHash({ kind: 'bookmarks' })} selected={screen.kind === 'bookmarks'}>
          <Star className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="flex-1 truncate">Bookmark</span>
        </SidebarLink>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 rounded-md text-sidebar-foreground max-md:size-11 md:ml-1"
          onClick={toggleColorTheme}
          aria-label={colorTheme === 'dark' ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
        >
          {colorTheme === 'dark' ? <Sun strokeWidth={1.5} /> : <Moon strokeWidth={1.5} />}
        </Button>
      </div>
    </nav>
  );
}

/** Feed 한 줄. 연속 실패가 있으면 줄 전체에 다음 시도 시각 툴팁을 단다. */
function FeedLink({ feed, selected }: { feed: FeedSummary; selected: boolean }) {
  const link = (
    <SidebarLink href={makeScreenHash({ kind: 'feed', feedId: feed.id })} selected={selected}>
      <span className="flex-1 truncate">{feed.title}</span>
      {feed.consecutiveFailures > 0 && (
        <span className="flex shrink-0 items-center gap-0.5">
          <TriangleAlert className="size-3.5 text-warn" strokeWidth={1.5} aria-hidden />
          <span className="font-mono text-numeric-badge tabular-nums text-warn-ink">{feed.consecutiveFailures}</span>
          <span className="sr-only">회 연속 실패</span>
        </span>
      )}
      {feed.unreadCount > 0 && (
        <Badge className="shrink-0 rounded-full bg-brand px-2 font-mono text-numeric-badge tabular-nums text-brand-foreground">
          {feed.unreadCount}
          <span className="sr-only">개 안 읽음</span>
        </Badge>
      )}
      {/* 안 읽음 수와 달리 열어 봐도 줄지 않으므로 속이 빈 알약으로 구분한다(ADR-0009). */}
      {feed.rankSnapshotNewCount > 0 && (
        <Badge
          variant="outline"
          className="shrink-0 rounded-full border-brand px-2 font-mono text-numeric-badge tabular-nums text-brand-ink"
        >
          NEW {feed.rankSnapshotNewCount}
          <span className="sr-only">개가 최근 수집에서 순위에 새로 들어옴</span>
        </Badge>
      )}
    </SidebarLink>
  );
  if (feed.consecutiveFailures === 0) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="text-caption">
        연속 {feed.consecutiveFailures}회 실패 · 다음 시도 {nextRunFormatter.format(new Date(feed.nextRunAt))}
      </TooltipContent>
    </Tooltip>
  );
}

type SidebarLinkProps = { href: string; selected: boolean; children: ReactNode } & React.ComponentProps<'a'>;

/** 사이드바의 링크 한 줄. 선택 상태는 민트가 아니라 회색 바탕으로 표시한다. */
function SidebarLink({ href, selected, children, className, ...props }: SidebarLinkProps) {
  return (
    <a
      href={href}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-sm px-3 py-2 text-body-sm whitespace-nowrap text-sidebar-foreground',
        'transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        'max-md:min-h-11 md:min-w-0',
        selected && 'bg-sidebar-accent text-body-sm-medium text-sidebar-accent-foreground hover:bg-sidebar-accent',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
