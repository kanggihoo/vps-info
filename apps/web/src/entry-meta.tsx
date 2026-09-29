/**
 * Entry 카드의 메타 줄. 카드 종류마다 `extra`(Ranked Feed는 최신 `metrics`를 덮은 값)에서 보여 줄 필드가 다르다.
 * Handler가 `extra`·`metrics`에 넣는 필드 이름은 docs/guides/adding-a-feed.md 2장을 따른다.
 */
import { ArrowUp, GitFork, MessageSquare, Star, Tag, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EntryView } from '@trendboda/api-types';
import type { CardKind } from './card-kind.ts';

const dateFormatter = new Intl.DateTimeFormat('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** 스타·포크·컨텍스트 길이처럼 큰 수는 GitHub·모델 문서처럼 "44K", "1M"으로 줄인다. */
const compactNumberFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
/** 토큰 1M개당 가격. */
const priceFormatter = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

/** 저장소 카드에 보여 줄 태그 수. */
const VISIBLE_TAG_COUNT = 4;

type EntryMetaProps = {
  entry: EntryView;
  cardKind: CardKind;
  metricChange?: number;
};

/** 카드 종류에 맞는 메타 조각들. 감싸는 줄(간격, 글자 크기)은 카드가 정한다. */
export function EntryMeta({ entry, cardKind, metricChange }: EntryMetaProps) {
  const { extra } = entry;
  const published = <EntryDate entry={entry} />;
  const comments = <CommentCount count={readNumber(extra, 'commentCount')} url={readString(extra, 'commentsUrl')} />;

  if (cardKind === 'repository')
    return (
      <>
        {readString(extra, 'language') && <span className="text-foreground">{readString(extra, 'language')}</span>}
        <MetricValue icon={Star} label="전체 스타" value={readNumber(extra, 'stars')} compact />
        <MetricValue icon={TrendingUp} label="기간 동안 늘어난 스타" value={readNumber(extra, 'starsGained')} change={metricChange} compact sign />
        <MetricValue icon={GitFork} label="포크" value={readNumber(extra, 'forks')} compact />
        <ExternalLink url={readString(extra, 'trendshiftUrl')}>Trendshift</ExternalLink>
        <ExternalLink url={readString(extra, 'hellogithubUrl')}>HelloGitHub</ExternalLink>
      </>
    );
  if (cardKind === 'model')
    return (
      <>
        {published}
        {readNumber(extra, 'contextLength') !== undefined && (
          <span>
            컨텍스트 <span className="font-mono tabular-nums">{compactNumberFormatter.format(readNumber(extra, 'contextLength') ?? 0)}</span>
          </span>
        )}
        <ModelPrice promptPricePerToken={readString(extra, 'promptPricePerToken')} completionPricePerToken={readString(extra, 'completionPricePerToken')} />
      </>
    );
  if (cardKind === 'paper')
    return (
      <>
        {entry.author && <span>{entry.author}</span>}
        {published}
        <MetricValue icon={ArrowUp} label="추천" value={readNumber(extra, 'score')} change={metricChange} />
        {comments}
        <ExternalLink url={readString(extra, 'arxivUrl')}>arXiv</ExternalLink>
      </>
    );
  if (cardKind === 'release')
    return (
      <>
        {published}
        {entry.author && <span>{entry.author}</span>}
      </>
    );
  return (
    <>
      <span>{new URL(entry.url).hostname}</span>
      {entry.author && <span>{entry.author}</span>}
      {published}
      <MetricValue icon={ArrowUp} label="점수" value={readNumber(extra, 'score')} change={metricChange} />
      {comments}
    </>
  );
}

/** 저장소 카드의 태그 줄. 앞의 몇 개만 보여 준다. */
export function EntryTags({ entry }: { entry: EntryView }) {
  const tags = readStringList(entry.extra, 'tags').slice(0, VISIBLE_TAG_COUNT);
  if (tags.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
      <Tag className="size-3.5" strokeWidth={1.5} aria-label="태그" />
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </p>
  );
}

/** 게시 시각. 정보원이 주지 않았으면 처음 수집한 시각이다. */
function EntryDate({ entry }: { entry: EntryView }) {
  return <span className="font-mono tabular-nums">{dateFormatter.format(new Date(entry.publishedAt ?? entry.firstSeenAt))}</span>;
}

type MetricValueProps = {
  icon: typeof ArrowUp;
  label: string;
  value: number | undefined;
  /** 직전 수집 대비 증감. 0이면 쓰지 않는다. */
  change?: number;
  compact?: boolean;
  /** 늘어난 양이라 앞에 +를 붙인다. */
  sign?: boolean;
};

/** 아이콘 + 수치(+ 증감). 값이 없으면 그리지 않는다. */
function MetricValue({ icon: Icon, label, value, change, compact = false, sign = false }: MetricValueProps) {
  if (value === undefined) return null;
  const formatted = compact ? compactNumberFormatter.format(value) : String(value);
  return (
    <span className="flex items-center gap-0.5 font-mono tabular-nums">
      <Icon className="size-3.5" strokeWidth={1.5} aria-label={label} />
      {sign && value > 0 ? `+${formatted}` : formatted}
      {change !== undefined && change !== 0 && (
        <span className="ml-1">
          ({change > 0 ? '+' : ''}
          {compact ? compactNumberFormatter.format(change) : change})
        </span>
      )}
    </span>
  );
}

/** 모델의 입력·출력 가격(토큰 1M개당). 0이면 무료, 음수(정보원이 "변동"으로 표시)나 빈 값이면 그리지 않는다. */
function ModelPrice({ promptPricePerToken, completionPricePerToken }: { promptPricePerToken?: string; completionPricePerToken?: string }) {
  const prompt = Number(promptPricePerToken);
  const completion = Number(completionPricePerToken);
  if (!promptPricePerToken || !completionPricePerToken || !(prompt >= 0) || !(completion >= 0)) return null;
  if (prompt === 0 && completion === 0) return <span>무료</span>;
  return (
    <span>
      입력 <span className="font-mono tabular-nums">{priceFormatter.format(prompt * 1_000_000)}</span> · 출력{' '}
      <span className="font-mono tabular-nums">{priceFormatter.format(completion * 1_000_000)}</span> / 1M 토큰
    </span>
  );
}

/** 댓글 수. 댓글 페이지 주소가 있으면 링크로 만든다. */
function CommentCount({ count, url }: { count: number | undefined; url: string | undefined }) {
  if (count === undefined) return null;
  const content = (
    <>
      <MessageSquare className="size-3.5" strokeWidth={1.5} aria-label="댓글" />
      <span className="font-mono tabular-nums">{count}</span>
    </>
  );
  if (!url) return <span className="flex items-center gap-1">{content}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 rounded-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </a>
  );
}

/** 원문 말고 함께 볼 페이지(정보원 페이지, arXiv)로 가는 링크. 주소가 없으면 그리지 않는다. */
function ExternalLink({ url, children }: { url: string | undefined; children: ReactNode }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-xs underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}

/**
 * `extra`·`metrics`에서 숫자 필드를 꺼낸다. Feed마다 필드가 달라서 타입을 확인하고 쓴다.
 * 순위표의 직전 대비 증감을 계산할 때도 쓴다.
 */
export function readNumber(values: Record<string, unknown> | null, key: string): number | undefined {
  const value = values?.[key];
  return typeof value === 'number' ? value : undefined;
}

function readString(values: Record<string, unknown> | null, key: string): string | undefined {
  const value = values?.[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readStringList(values: Record<string, unknown> | null, key: string): string[] {
  const value = values?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
