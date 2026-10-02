/**
 * 왼쪽 Feed 목록. Stream과 Ranked 두 구역으로 나누고, Feed Group은 한 줄로 보인다(ADR-0010).
 * Feed 줄에는 안 읽음 수(Ranked Feed는 NEW 수)를, Group 줄에는 새로 볼 것이 있다는 점만 보여 준다. 연속 실패는 경고로 알린다.
 * 아래쪽에 대화 엔진·모델 드롭다운(ADR-0015)과 Bookmark를, 위쪽 모서리에 테마 토글을 둔다. 768px 미만에서는 위쪽 가로 탭 줄이 되고, 그 줄 안에서만 가로로 스크롤한다(DESIGN.md).
 */
import { GripVertical, Moon, Settings, Star, Sun, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { FeedKind, LlmModelsView, FeedNavigationOrder } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from 'cn';
import { FeedCountBadge } from './feed-count-badge.tsx';
import { LlmChoiceSelect } from './llm-choice-select.tsx';
import { hasSomethingNew, pickRowFeed, sidebarRowItem, sidebarRowKey, type SidebarRow, type SidebarSection } from './feed-group.ts';
import { makeScreenHash, type Screen } from './screen-route.ts';
import { useColorTheme } from './use-color-theme.ts';
import { useMediaQuery } from './use-media-query.ts';
import type { LlmChoice } from './use-llm-choice.ts';

const nextRunFormatter = new Intl.DateTimeFormat('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** 구역 머리글. 도메인 용어 그대로 쓴다(CONTEXT.md). */
const SECTION_TITLES: Record<FeedKind, string> = { stream: 'Stream', ranked: 'Ranked' };

type FeedSidebarProps = {
  sections: SidebarSection[];
  orderReady: boolean;
  saving: boolean;
  failed: boolean;
  statusMessage: string;
  onRetryOrder: () => void;
  onSaveOrder: (order: FeedNavigationOrder) => void;
  screen: Screen;
  llmModels: LlmModelsView | undefined;
  llmChoice: LlmChoice | undefined;
  onChooseLlm: (choice: LlmChoice) => void;
};

export function FeedSidebar({ sections, orderReady, saving, failed, statusMessage, onRetryOrder, onSaveOrder, screen, llmModels, llmChoice, onChooseLlm }: FeedSidebarProps) {
  const { colorTheme, toggleColorTheme } = useColorTheme();
  const wideSidebar = useMediaQuery('(min-width: 768px)');
  const canSort = wideSidebar && orderReady && !saving;
  const selectedFeedId = screen.kind === 'feed' ? screen.feedId : undefined;

  return (
    <nav
      data-reading-panel="feeds"
      tabIndex={-1}
      aria-label="Feed 목록"
      className={cn(
        // relative: sr-only(absolute) 글자가 페이지 기준으로 놓여 가로 스크롤을 만들지 않게 이 줄 안에 가둔다.
        'relative flex gap-1 overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring border-b border-sidebar-border bg-sidebar p-2 max-md:[scrollbar-width:none]',
        'md:flex-col md:gap-0 md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:p-3',
      )}
    >
      <h1 className="hidden px-3 pt-1 pb-4 text-app-title text-foreground md:block">Trendboda</h1>
      {sections.map((section) => (
        <section key={section.kind} className="flex gap-1 md:mb-3 md:flex-col md:gap-0" aria-labelledby={`sidebar-section-${section.kind}`}>
          <h2 id={`sidebar-section-${section.kind}`} className="sr-only px-3 pt-2 pb-1 text-micro-uppercase text-muted-foreground md:not-sr-only">
            {SECTION_TITLES[section.kind]}
          </h2>
          <SortableSection key={String(wideSidebar)} section={section} selectedFeedId={selectedFeedId} enabled={canSort}
            onMove={(rows) => {
              const order: FeedNavigationOrder = { stream: [], ranked: [] };
              for (const current of sections) order[current.kind] = (current.kind === section.kind ? rows : current.rows).map(sidebarRowItem);
              onSaveOrder(order);
            }} />
        </section>
      ))}
      <div className="shrink-0 px-2 text-caption md:mb-2" aria-live="polite" aria-atomic="true">
        <span className={cn(failed ? 'text-destructive' : 'text-muted-foreground', !failed && !saving && 'sr-only')}>{statusMessage}</span>
        {failed && <Button variant="outline" size="sm" className="ml-1" onClick={onRetryOrder}>다시 시도</Button>}
      </div>
      <div className="flex gap-1 md:mt-auto md:flex-col">
        <LlmChoiceSelect models={llmModels} choice={llmChoice} onChoose={onChooseLlm} />
        <SidebarLink href={makeScreenHash({ kind: 'bookmarks' })} selected={screen.kind === 'bookmarks'}>
          <Star className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="flex-1 truncate">Bookmark</span>
        </SidebarLink>
        <SidebarLink href={makeScreenHash({ kind: 'admin' })} selected={screen.kind === 'admin'}>
          <Settings className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="flex-1 truncate">관리</span>
        </SidebarLink>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 rounded-md text-sidebar-foreground max-md:size-11 md:absolute md:top-3 md:right-3"
        onClick={toggleColorTheme}
        aria-label={colorTheme === 'dark' ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
      >
        {colorTheme === 'dark' ? <Sun strokeWidth={1.5} /> : <Moon strokeWidth={1.5} />}
      </Button>
    </nav>
  );
}

/** 각 구역에 독립된 정렬 컨텍스트를 두어 마우스·키보드 모두 구역 밖으로 이동하지 않는다. */
function SortableSection({ section, selectedFeedId, enabled, onMove }: {
  section: SidebarSection; selectedFeedId: string | undefined; enabled: boolean; onMove: (rows: SidebarRow[]) => void;
}) {
  const [activeKey, setActiveKey] = useState<string>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: {
      start: ['Space', 'Enter'], cancel: ['Escape'], end: ['Space', 'Enter'],
    } }));
  const activeRow = section.rows.find((row) => sidebarRowKey(row) === activeKey);
  const name = (key: string | number) => {
    const row = section.rows.find((candidate) => sidebarRowKey(candidate) === key);
    return row ? (row.kind === 'feed' ? row.feed.title : row.group.title) : '항목';
  };
  const finish = ({ active, over }: DragEndEvent) => {
    setActiveKey(undefined);
    if (!enabled || !over || active.id === over.id) return;
    const from = section.rows.findIndex((row) => sidebarRowKey(row) === active.id);
    const to = section.rows.findIndex((row) => sidebarRowKey(row) === over.id);
    if (from >= 0 && to >= 0) onMove(arrayMove(section.rows, from, to));
  };
  return <div data-sorting={Boolean(activeKey)}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveKey(String(active.id))}
      onDragCancel={() => setActiveKey(undefined)} onDragEnd={finish}
      accessibility={{ screenReaderInstructions: { draggable: 'Space 또는 Enter로 이동을 시작합니다. 위·아래 방향키로 같은 구역에서 이동하고 Space 또는 Enter로 저장합니다. Escape로 취소합니다.' },
        announcements: {
          onDragStart: ({ active }) => `${name(active.id)} 이동을 시작합니다.`,
          onDragOver: ({ active, over }) => over ? `${name(active.id)}을 ${name(over.id)} 위치로 이동합니다.` : undefined,
          onDragEnd: ({ active, over }) => over && active.id !== over.id ? `${name(active.id)} 위치를 저장합니다.` : '순서가 바뀌지 않았습니다.',
          onDragCancel: () => '이동을 취소했습니다.',
        } }}>
      <SortableContext items={section.rows.map(sidebarRowKey)} strategy={verticalListSortingStrategy}>
        <ul className="flex gap-1 md:flex-col">
          {section.rows.map((row) => <SortableRow key={sidebarRowKey(row)} row={row} selectedFeedId={selectedFeedId} enabled={enabled} />)}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={null}>{activeRow && <div className="rounded-sm border bg-sidebar px-3 py-2 text-body-sm text-foreground">{name(sidebarRowKey(activeRow))}</div>}</DragOverlay>
    </DndContext>
  </div>;
}

/** 이름 링크와 이동 손잡이를 나눠, 클릭이 드래그로 바뀌지 않게 한다. */
function SortableRow({ row, selectedFeedId, enabled }: { row: SidebarRow; selectedFeedId: string | undefined; enabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useSortable({ id: sidebarRowKey(row), disabled: !enabled, transition: null });
  const title = row.kind === 'feed' ? row.feed.title : row.group.title;
  return <li ref={setNodeRef} className={cn('flex min-w-0 items-center', isDragging && 'opacity-40')}
    style={transform ? { transform: `translate3d(0, ${transform.y}px, 0)` } : undefined}>
    <Button ref={setActivatorNodeRef} variant="ghost" size="icon-sm" className="hidden shrink-0 cursor-grab touch-none rounded-sm aria-disabled:opacity-50 md:inline-flex active:cursor-grabbing"
      {...attributes} {...listeners} data-sort-handle aria-label={`${title} 순서 이동`} aria-disabled={!enabled}>
      <GripVertical className="size-4" strokeWidth={1.5} aria-hidden />
    </Button>
    <SidebarRowLink row={row} selectedFeedId={selectedFeedId} />
  </li>;
}

/** Feed 한 줄 또는 Group 한 줄. 연속 실패가 있으면 줄 전체에 실패한 Feed와 다음 시도 시각 툴팁을 단다. */
function SidebarRowLink({ row, selectedFeedId }: { row: SidebarRow; selectedFeedId: string | undefined }) {
  const rowFeeds = row.kind === 'feed' ? [row.feed] : row.feeds;
  const failingFeeds = rowFeeds.filter((feed) => feed.consecutiveFailures > 0);
  const link = (
    <SidebarLink
      data-navigation-item={sidebarRowKey(row)}
      href={makeScreenHash({ kind: 'feed', feedId: pickRowFeed(row).id })}
      selected={rowFeeds.some((feed) => feed.id === selectedFeedId)}
    >
      <span className="flex-1 truncate">{row.kind === 'feed' ? row.feed.title : row.group.title}</span>
      {failingFeeds.length > 0 && <FailureMark count={Math.max(...failingFeeds.map((feed) => feed.consecutiveFailures))} />}
      {row.kind === 'feed' ? <FeedCountBadge feed={row.feed} /> : row.feeds.some(hasSomethingNew) && <NewDot />}
    </SidebarLink>
  );
  if (failingFeeds.length === 0) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="flex flex-col gap-0.5 text-caption">
        {failingFeeds.map((feed) => (
          <span key={feed.id}>
            {row.kind === 'group' && `${feed.title} · `}연속 {feed.consecutiveFailures}회 실패 · 다음 시도 {nextRunFormatter.format(new Date(feed.nextRunAt))}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

/** 연속 실패 경고. 바탕 없이 아이콘과 횟수만 둔다. */
function FailureMark({ count }: { count: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <TriangleAlert className="size-3.5 text-warn" strokeWidth={1.5} aria-hidden />
      <span className="font-mono text-numeric-badge tabular-nums text-warn-ink">{count}</span>
      <span className="sr-only">회 연속 실패</span>
    </span>
  );
}

/** Group 줄의 "새로 볼 것이 있다" 점. 몇 개인지는 가운데 탭에서 본다(ADR-0010). */
function NewDot() {
  return (
    <span className="flex shrink-0 items-center">
      <span className="size-2 rounded-full bg-brand" aria-hidden />
      <span className="sr-only">새로 볼 것 있음</span>
    </span>
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
        'flex min-w-0 flex-1 items-center gap-2 rounded-sm px-3 py-2 text-body-sm whitespace-nowrap text-sidebar-foreground',
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
