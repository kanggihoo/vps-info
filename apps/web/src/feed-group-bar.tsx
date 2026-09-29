/**
 * Feed Group에 든 Feed를 볼 때 가운데 위쪽에 두는 변형 선택 줄(ADR-0010).
 * 첫 번째 축(기간, 구역)은 탭으로, 나머지 축(언어)은 드롭다운으로 고른다. 탭과 선택지마다 그 Feed의 NEW(안 읽음) 수를 붙인다.
 * 고르면 같은 Group의 다른 Feed 화면으로 옮겨 간다. 화면 주소는 여전히 Feed를 가리킨다.
 */
import type { FeedGroupAxis, FeedGroupView, FeedSummary } from '@trendboda/api-types';
import { cn } from 'cn';
import { FeedCountBadge, formatFeedCount } from './feed-count-badge.tsx';
import { findVariantFeed } from './feed-group.ts';
import { makeScreenHash } from './screen-route.ts';

type FeedGroupBarProps = {
  group: FeedGroupView;
  /** 이 Group에 든 Feed. 선언 순서다. */
  feeds: FeedSummary[];
  selectedFeed: FeedSummary;
};

export function FeedGroupBar({ group, feeds, selectedFeed }: FeedGroupBarProps) {
  const [tabAxis, ...filterAxes] = group.axes;
  return (
    <div className="shrink-0 border-b bg-background">
      <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-2 px-4 py-2">
        {tabAxis && (
          <nav aria-label={`${group.title} ${tabAxis.title}`} className="flex flex-wrap gap-1">
            {tabAxis.values.map(({ value, title }) => {
              const target = findVariantFeed(feeds, selectedFeed, tabAxis.key, value);
              if (!target) return null;
              const selected = target.id === selectedFeed.id;
              return (
                <a
                  key={value}
                  href={makeScreenHash({ kind: 'feed', feedId: target.id })}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-sm text-muted-foreground max-md:min-h-11',
                    'transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'bg-sidebar-accent text-body-sm-medium text-foreground hover:bg-sidebar-accent',
                  )}
                >
                  {title}
                  <FeedCountBadge feed={target} />
                </a>
              );
            })}
          </nav>
        )}
        {filterAxes.map((axis) => (
          <AxisSelect key={axis.key} axis={axis} feeds={feeds} selectedFeed={selectedFeed} />
        ))}
      </div>
    </div>
  );
}

/** 탭이 아닌 축 하나의 드롭다운. 선택지 글자에 NEW 수를 붙인다. 고르면 그 Feed로 옮겨 간다. */
function AxisSelect({ axis, feeds, selectedFeed }: { axis: FeedGroupAxis; feeds: FeedSummary[]; selectedFeed: FeedSummary }) {
  const options = axis.values.flatMap(({ value, title }) => {
    const target = findVariantFeed(feeds, selectedFeed, axis.key, value);
    return target ? [{ value, title, target }] : [];
  });
  return (
    <select
      aria-label={axis.title}
      value={selectedFeed.group?.variant[axis.key]}
      onChange={(event) => {
        const target = options.find((option) => option.value === event.target.value)?.target;
        if (target) window.location.hash = makeScreenHash({ kind: 'feed', feedId: target.id });
      }}
      className={cn(
        'h-8 rounded-full border border-input bg-background px-3 text-body-sm text-foreground md:ml-auto max-md:h-11',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {options.map(({ value, title, target }) => (
        <option key={value} value={value}>
          {title}
          {formatFeedCount(target)}
        </option>
      ))}
    </select>
  );
}
