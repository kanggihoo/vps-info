/**
 * 오른쪽에 펼친 Entry(ADR-0011). 제목·메타·요약을 보여 주고, 도구줄에서 Bookmark·원문 읽기·번역·원문 열기를 한다.
 *
 * 펼치면 Opened At을 기록한다(CONTEXT.md). 원문 읽기 결과는 저장하지 않아 켤 때마다 서버가 원문을 다시 가져온다.
 * Entry가 바뀌면 부모가 `key`로 새로 만들므로 읽기 모드·번역 표시·진행 중인 요청이 모두 초기화된다.
 */
import { ArrowLeft, BookOpenText, ExternalLink, Languages, Star } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { EntryView, FeedSummary, ReaderFailureReason, ReaderView, TranslationFailureReason } from '@trendboda/api-types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from 'cn';
import { ApiError, apiClient } from './api-client.ts';
import { findCardKind } from './card-kind.ts';
import { useEntryChanges } from './entry-changes.tsx';
import { EntryMeta, EntryTags } from './entry-meta.tsx';
import type { EntrySelection } from './entry-selection.ts';
import { EmptyMessage, LoadError } from './load-states.tsx';
import { RankMovementMark } from './rank-table.tsx';
import { isReaderAvailable } from './reader-availability.ts';
import { ReaderMarkdown } from './reader-markdown.tsx';

/** 원문 읽기 실패 이유별 안내. */
const READER_FAILURE_MESSAGES: Record<ReaderFailureReason, string> = {
  'upstream-status': '원문 사이트가 요청을 거절했습니다.',
  timeout: '원문 사이트가 15초 안에 응답하지 않았습니다.',
  'too-large': '원문 페이지가 너무 큽니다.',
  'not-html': '원문이 웹 페이지가 아닙니다(PDF 등).',
  unreachable: '원문 사이트에 연결하지 못했습니다.',
  empty: '원문에서 본문을 찾지 못했습니다.',
};

/** 번역 실패 이유별 안내. */
const TRANSLATION_FAILURE_MESSAGES: Record<TranslationFailureReason, string> = {
  'translation-disabled': '서버에 DeepL 키가 없어 번역할 수 없습니다.',
  'translation-auth': 'DeepL이 키를 거부했습니다. 서버의 DEEPL_API_KEY를 확인하세요.',
  'translation-quota': '이번 달 DeepL 번역 한도를 다 썼습니다.',
  'translation-busy': 'DeepL에 요청이 몰렸습니다. 잠시 뒤 다시 누르세요.',
  'translation-failed': '번역하지 못했습니다. 다시 누르세요.',
};

type ReaderState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'loaded'; view: ReaderView }
  | { status: 'failed'; reason: ReaderFailureReason | undefined };

type EntryPanelProps = {
  entryId: number;
  /** 목록에서 골랐으면 목록이 가진 Entry. 화면 주소로 바로 열었으면 없고, 그때는 서버에서 받는다. */
  selection: EntrySelection | undefined;
  /** Feed 이름·카드 종류·읽기 버튼 여부를 정하려고 쓴다. */
  feeds: FeedSummary[];
  /** 펼친 화면을 닫는다(좁은 화면의 뒤로 버튼). */
  onClose: () => void;
};

export function EntryPanel({ entryId, selection, feeds, onClose }: EntryPanelProps) {
  const { withChanges, publishChange } = useEntryChanges();
  const [loadedEntry, setLoadedEntry] = useState<EntryView | undefined>(selection?.entry);
  const [loadedFeedTitle, setLoadedFeedTitle] = useState<string | undefined>();
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'not-found' | 'failed'>(selection ? 'loaded' : 'loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [reader, setReader] = useState<ReaderState>({ status: 'off' });
  const readerRequestRef = useRef<AbortController | undefined>(undefined);
  const [showTranslation, setShowTranslation] = useState(() => Boolean(selection && withChanges(selection.entry).translatedTitle));
  const [translating, setTranslating] = useState(false);
  const [translationFailure, setTranslationFailure] = useState<TranslationFailureReason | undefined>();
  const openedEntryIdRef = useRef<number | undefined>(undefined);

  // 화면 주소로 바로 열었으면 Entry를 받는다.
  useEffect(() => {
    if (selection) return;
    setLoadState('loading');
    apiClient
      .getEntry(entryId)
      .then((fetchedEntry) => {
        setLoadedEntry(fetchedEntry);
        setLoadedFeedTitle(fetchedEntry.feedTitle);
        setShowTranslation(Boolean(fetchedEntry.translatedTitle));
        setLoadState('loaded');
      })
      .catch((error: unknown) => {
        console.error(error);
        setLoadState(error instanceof ApiError && error.status === 404 ? 'not-found' : 'failed');
      });
  }, [entryId, selection, loadAttempt]);

  // 다른 Entry로 옮기면(이 컴포넌트가 사라지면) 늦게 오는 원문 읽기 응답을 버린다.
  useEffect(() => () => readerRequestRef.current?.abort(), []);

  const entry = loadedEntry && withChanges(loadedEntry);

  // 펼친 Entry는 연 것이다(Opened At). 처음 연 시각만 남으므로 이미 있으면 보내지 않는다.
  useEffect(() => {
    if (!entry || entry.openedAt || openedEntryIdRef.current === entry.id) return;
    openedEntryIdRef.current = entry.id;
    publishChange({ ...entry, openedAt: new Date().toISOString() });
    apiClient.markOpened(entry.id).catch(console.error);
  }, [entry, publishChange]);

  if (loadState === 'failed') return <LoadError message="Entry를 불러오지 못했습니다." onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />;
  if (loadState === 'not-found') return <EmptyMessage>없는 Entry입니다. 목록에서 다른 Entry를 고르세요.</EmptyMessage>;
  if (!entry) return <PanelSkeleton />;

  const feed = feeds.find((candidate) => candidate.id === entry.feedId);
  const cardKind = findCardKind(entry.feedId, feed?.group?.id);
  const readerAvailable = isReaderAvailable(entry.feedId, feed?.group?.id);
  const bookmarked = Boolean(entry.bookmarkedAt);
  const translated = showTranslation && entry.translatedTitle !== null;
  const rankedEntry = selection?.rankedEntry;

  const toggleBookmark = async () => {
    await apiClient.setBookmarked(entry.id, !bookmarked);
    publishChange({ ...entry, bookmarkedAt: bookmarked ? null : new Date().toISOString() });
  };

  const toggleReader = () => {
    readerRequestRef.current?.abort();
    if (reader.status !== 'off') {
      setReader({ status: 'off' });
      return;
    }
    const request = new AbortController();
    readerRequestRef.current = request;
    setReader({ status: 'loading' });
    apiClient
      .readOriginal(entry.id, request.signal)
      .then((view) => setReader({ status: 'loaded', view }))
      .catch((error: unknown) => {
        if (request.signal.aborted) return;
        console.error(error);
        setReader({ status: 'failed', reason: error instanceof ApiError ? (error.reason as ReaderFailureReason | undefined) : undefined });
      });
  };

  /** 번역이 있으면 원문과 번역 사이를 오가고, 없으면 번역한다. */
  const toggleTranslation = () => {
    setTranslationFailure(undefined);
    if (entry.translatedTitle !== null) {
      setShowTranslation((current) => !current);
      return;
    }
    setTranslating(true);
    apiClient
      .translateEntry(entry.id)
      .then((translation) => {
        publishChange({ ...entry, ...translation });
        setShowTranslation(true);
      })
      .catch((error: unknown) => {
        console.error(error);
        const reason = error instanceof ApiError ? (error.reason as TranslationFailureReason | undefined) : undefined;
        setTranslationFailure(reason ?? 'translation-failed');
      })
      .finally(() => setTranslating(false));
  };

  const summary = translated ? (entry.translatedSummary ?? entry.summary) : entry.summary;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-1 border-b px-2 py-2 lg:px-4">
        <ToolbarButton label="목록으로" className="lg:hidden" onClick={onClose}>
          <ArrowLeft />
        </ToolbarButton>
        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton label={bookmarked ? 'Bookmark 해제' : 'Bookmark'} pressed={bookmarked} onClick={toggleBookmark} className={cn(bookmarked && 'text-brand-ink hover:text-brand-ink')}>
            <Star className={cn(bookmarked && 'fill-current')} />
          </ToolbarButton>
          {readerAvailable && (
            <ToolbarButton label={reader.status === 'off' ? '원문 읽기' : '요약으로 돌아가기'} pressed={reader.status !== 'off'} onClick={toggleReader}>
              <BookOpenText />
            </ToolbarButton>
          )}
          <ToolbarButton
            label={translating ? '번역 중' : translated ? '원문 보기' : entry.translatedTitle !== null ? '번역 보기' : '한국어로 번역'}
            pressed={translated}
            disabled={translating}
            onClick={toggleTranslation}
          >
            <Languages className={cn(translating && 'animate-pulse motion-reduce:animate-none')} />
          </ToolbarButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full max-md:size-11" asChild>
                <a href={entry.url} target="_blank" rel="noopener noreferrer" aria-label="원문 열기">
                  <ExternalLink strokeWidth={1.5} />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>원문 열기</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <article className="mx-auto max-w-[760px] px-4 py-6 lg:px-8">
          {rankedEntry && (
            <div className="mb-3 flex items-center gap-2 text-caption text-muted-foreground">
              <span>
                <span className="font-mono text-entry-title tabular-nums text-foreground">{rankedEntry.rank}</span>위
              </span>
              <RankMovementMark rankedEntry={rankedEntry} />
            </div>
          )}
          <h2 className="text-panel-title break-words text-foreground">{translated ? entry.translatedTitle : entry.title}</h2>
          {translated && <p className="mt-1 text-body-sm break-words text-muted-foreground">{entry.title}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className="text-foreground">{feed?.title ?? loadedFeedTitle ?? entry.feedId}</span>
            <EntryMeta entry={entry} cardKind={cardKind} metricChange={selection?.metricChange} />
          </div>
          {cardKind === 'repository' && <EntryTags entry={entry} />}
          {translationFailure && (
            <p role="alert" className="mt-3 text-caption text-destructive">
              {TRANSLATION_FAILURE_MESSAGES[translationFailure]}
            </p>
          )}
          <Separator className="my-5" />
          {reader.status === 'off' ? (
            <SummaryBody summary={summary} readerAvailable={readerAvailable} />
          ) : (
            <ReaderBody reader={reader} url={entry.url} translated={translated} />
          )}
        </article>
      </ScrollArea>
    </div>
  );
}

/** 오른쪽이 비었을 때(넓은 화면에서 아무 Entry도 고르지 않았을 때). */
export function EntryPanelPlaceholder() {
  return <EmptyMessage>목록에서 Entry를 고르면 여기에 펼쳐집니다.</EmptyMessage>;
}

function SummaryBody({ summary, readerAvailable }: { summary: string | null; readerAvailable: boolean }) {
  if (summary) return <p className="text-body-sm break-words text-foreground">{summary}</p>;
  return <p className="text-body-sm text-muted-foreground">{readerAvailable ? '요약이 없습니다. 원문 읽기로 본문을 볼 수 있습니다.' : '요약이 없습니다.'}</p>;
}

function ReaderBody({ reader, url, translated }: { reader: Exclude<ReaderState, { status: 'off' }>; url: string; translated: boolean }) {
  if (reader.status === 'loading') {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="원문을 가져오는 중">
        {['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-2/3'].map((width, index) => (
          <Skeleton key={index} className={cn('h-3.5 rounded-xs', width)} />
        ))}
      </div>
    );
  }
  if (reader.status === 'failed') {
    return (
      <Alert variant="destructive">
        <AlertTitle>원문을 가져오지 못했습니다</AlertTitle>
        <AlertDescription>
          <p>{reader.reason ? READER_FAILURE_MESSAGES[reader.reason] : '잠시 뒤 다시 시도하세요.'}</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            원문 사이트에서 읽기
          </a>
        </AlertDescription>
      </Alert>
    );
  }
  const { view } = reader;
  const source = [view.siteName, view.byline].filter(Boolean).join(' · ');
  return (
    <>
      {(source || translated) && (
        <p className="mb-4 text-caption text-muted-foreground">
          {source}
          {source && translated && ' · '}
          {translated && '원문 본문은 번역하지 않습니다.'}
        </p>
      )}
      <ReaderMarkdown markdown={view.markdown} />
    </>
  );
}

type ToolbarButtonProps = {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
};

/** 도구줄의 아이콘 버튼. 무슨 버튼인지는 툴팁과 `aria-label`로 알린다. 켜진 상태는 민트가 아니라 hover 바탕으로 보인다. */
function ToolbarButton({ label, pressed, disabled, className, onClick, children }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('rounded-full max-md:size-11 [&_svg]:stroke-[1.5]', pressed && 'bg-accent text-foreground', className)}
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PanelSkeleton() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 lg:px-8" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-7 w-3/4 rounded-xs" />
      <Skeleton className="mt-3 h-3.5 w-1/3 rounded-xs" />
      <Skeleton className="mt-6 h-3.5 w-full rounded-xs" />
      <Skeleton className="mt-2 h-3.5 w-5/6 rounded-xs" />
    </div>
  );
}
