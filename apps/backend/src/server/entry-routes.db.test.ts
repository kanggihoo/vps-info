import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorBody, BookmarkedEntryView, EntryView, FeedTitledEntryView, ReaderView, TranslationView } from '@trendboda/api-types';
import { runFetchAttempt } from '../collector/fetch-attempt.ts';
import { connectionPool, database } from '../db/database-client.ts';
import { entry, entryTranslation, feed } from '../db/schema.ts';
import { feedDefinitions } from '../feed-definitions.ts';
import { resetDatabase } from '../test-support/reset-database.ts';
import { buildServer } from './build-server.ts';
import { TranslationFailure, type TextTranslator } from './deepl-translator.ts';
import { type OriginalPage, type OriginalPageFetcher, ReaderFailure } from './original-page.ts';

// 라우트는 코드의 Feed 선언을 기준으로 동작하므로, 실제로 선언된 Feed id를 쓴다(geeknews: Stream, hn-best: Ranked).

const ARTICLE_HTML = `<!doctype html><html><head><title>Readable article</title><meta property="og:site_name" content="Example Blog"></head>
<body><nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article><h1>Readable article</h1>
<p>This is the first paragraph of a long article about databases. It explains why queues can live inside PostgreSQL.</p>
<p>The second paragraph keeps going with enough words for the extractor to treat it as the main content of the page.</p>
<p>A <a href="/related">related post</a> is linked from the third paragraph, which closes the article.</p>
</article><footer>Copyright</footer></body></html>`;

const page = (overrides: Partial<OriginalPage> = {}): OriginalPage => ({
  status: 200,
  contentType: 'text/html; charset=utf-8',
  html: ARTICLE_HTML,
  finalUrl: 'https://example.com/articles/queue',
  ...overrides,
});

/** 가짜 원문 가져오기·번역 함수로 서버를 만든다. */
async function buildServerWith(options: { fetchOriginalPage?: OriginalPageFetcher; translateTexts?: TextTranslator | null }) {
  return buildServer({ logger: false, fetchOriginalPage: options.fetchOriginalPage ?? (async () => page()), translateTexts: options.translateTexts ?? null });
}

let server: FastifyInstance | undefined;

/** 이 파일의 서버를 바꿔 끼운다. 이전 서버는 닫는다. */
async function useServer(options: Parameters<typeof buildServerWith>[0]) {
  await server?.close();
  server = await buildServerWith(options);
  return server;
}

beforeEach(async () => {
  await resetDatabase();
  await database.insert(feed).values([
    { id: 'geeknews', intervalMinutes: 60 },
    { id: 'hn-best', intervalMinutes: 360, rankLimit: 100 },
  ]);
  await database.insert(entry).values([
    { feedId: 'geeknews', dedupKey: 'ext:1', url: 'https://example.com/1', title: 'Queues in Postgres', summary: 'Why a table can be a queue.', raw: { secret: '원본' } },
    { feedId: 'geeknews', dedupKey: 'ext:2', url: 'https://example.com/2', title: 'No summary here', raw: { secret: '원본' } },
  ]);
});
afterAll(async () => {
  await server?.close();
  await connectionPool.end();
});

describe('GET /api/entries/:entryId', () => {
  it('Entry를 Feed 이름과 함께 주고, raw는 주지 않는다 (ADR-0003)', async () => {
    const app = await useServer({});
    const response = await app.inject('/api/entries/1');
    const body = response.json<FeedTitledEntryView>();
    expect(body).toMatchObject({ id: 1, title: 'Queues in Postgres', feedTitle: 'GeekNews', translatedTitle: null, translatedSummary: null });
    expect(response.body).not.toContain('원본');
  });

  it('없는 Entry는 404다', async () => {
    const app = await useServer({});
    expect((await app.inject('/api/entries/999')).statusCode).toBe(404);
  });
});

describe('GET /api/entries/:entryId/reader (ADR-0011)', () => {
  it('원문 페이지에서 본문을 Markdown으로 뽑아 준다', async () => {
    const fetchOriginalPage = vi.fn<OriginalPageFetcher>(async () => page());
    const app = await useServer({ fetchOriginalPage });
    const response = await app.inject('/api/entries/1/reader');
    expect(response.statusCode).toBe(200);
    const reader = response.json<ReaderView>();
    expect(fetchOriginalPage).toHaveBeenCalledWith('https://example.com/1');
    expect(reader.title).toBe('Readable article');
    expect(reader.siteName).toBe('Example Blog');
    expect(reader.markdown).toContain('queues can live inside PostgreSQL');
    // 상대 링크는 리다이렉트 뒤 주소를 기준으로 풀린다.
    expect(reader.markdown).toContain('https://example.com/related');
    expect(reader.markdown).not.toContain('Copyright');
  });

  it('부를 때마다 원문을 다시 가져온다(저장하지 않는다)', async () => {
    const fetchOriginalPage = vi.fn<OriginalPageFetcher>(async () => page());
    const app = await useServer({ fetchOriginalPage });
    await app.inject('/api/entries/1/reader');
    await app.inject('/api/entries/1/reader');
    expect(fetchOriginalPage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['200이 아닌 응답', async () => page({ status: 403 }), 'upstream-status'],
    ['HTML이 아닌 응답', async () => page({ contentType: 'application/pdf' }), 'not-html'],
    ['본문이 빈 페이지', async () => page({ html: '<html><body></body></html>' }), 'empty'],
    [
      '타임아웃',
      async () => {
        throw new ReaderFailure('timeout', '15초 안에 받지 못했습니다');
      },
      'timeout',
    ],
  ] satisfies [string, OriginalPageFetcher, string][])('%s는 502와 실패 이유를 준다', async (_case, fetchOriginalPage, reason) => {
    const app = await useServer({ fetchOriginalPage });
    const response = await app.inject('/api/entries/1/reader');
    expect(response.statusCode).toBe(502);
    expect(response.json<ApiErrorBody>().reason).toBe(reason);
  });

  it('짧은 본문도 그대로 준다', async () => {
    const app = await useServer({ fetchOriginalPage: async () => page({ html: '<html><body><p>Please enable JS.</p></body></html>' }) });
    const response = await app.inject('/api/entries/1/reader');
    expect(response.statusCode).toBe(200);
    expect(response.json<ReaderView>().markdown).toContain('Please enable JS.');
  });

  it('없는 Entry는 404다', async () => {
    const app = await useServer({});
    expect((await app.inject('/api/entries/999/reader')).statusCode).toBe(404);
  });
});

describe('POST /api/entries/:entryId/translation (ADR-0011)', () => {
  const fakeTranslator = () => vi.fn<TextTranslator>(async (texts) => texts.map((text) => `번역: ${text}`));

  it('제목과 요약을 한 번에 번역해 저장하고, 두 번째에는 DeepL을 부르지 않는다', async () => {
    const translateTexts = fakeTranslator();
    const app = await useServer({ translateTexts });
    const first = await app.inject({ method: 'POST', url: '/api/entries/1/translation' });
    expect(first.json<TranslationView>()).toEqual({ translatedTitle: '번역: Queues in Postgres', translatedSummary: '번역: Why a table can be a queue.' });
    expect(translateTexts).toHaveBeenCalledWith(['Queues in Postgres', 'Why a table can be a queue.']);

    const second = await app.inject({ method: 'POST', url: '/api/entries/1/translation' });
    expect(second.json<TranslationView>()).toEqual(first.json<TranslationView>());
    expect(translateTexts).toHaveBeenCalledTimes(1);
  });

  it('요약이 없으면 제목만 보낸다', async () => {
    const translateTexts = fakeTranslator();
    const app = await useServer({ translateTexts });
    const response = await app.inject({ method: 'POST', url: '/api/entries/2/translation' });
    expect(response.json<TranslationView>()).toEqual({ translatedTitle: '번역: No summary here', translatedSummary: null });
    expect(translateTexts).toHaveBeenCalledWith(['No summary here']);
  });

  it('키가 없으면 503 translation-disabled이고 아무것도 저장하지 않는다', async () => {
    const app = await useServer({ translateTexts: null });
    const response = await app.inject({ method: 'POST', url: '/api/entries/1/translation' });
    expect(response.statusCode).toBe(503);
    expect(response.json<ApiErrorBody>().reason).toBe('translation-disabled');
    expect(await database.$count(entryTranslation)).toBe(0);
  });

  it.each(['translation-quota', 'translation-auth', 'translation-busy'] as const)('DeepL이 %s로 실패하면 502와 그 이유를 주고 저장하지 않는다', async (reason) => {
    const app = await useServer({
      translateTexts: async () => {
        throw new TranslationFailure(reason, 'DeepL 실패');
      },
    });
    const response = await app.inject({ method: 'POST', url: '/api/entries/1/translation' });
    expect(response.statusCode).toBe(502);
    expect(response.json<ApiErrorBody>().reason).toBe(reason);
    expect(await database.$count(entryTranslation)).toBe(0);
  });

  it('없는 Entry는 404다', async () => {
    const app = await useServer({ translateTexts: fakeTranslator() });
    expect((await app.inject({ method: 'POST', url: '/api/entries/999/translation' })).statusCode).toBe(404);
  });
});

describe('Entry 응답의 번역 필드', () => {
  it('번역한 Entry는 타임라인·Bookmark·순위표·하나 조회에서 번역이 채워지고, 나머지는 null이다', async () => {
    const hnBest = feedDefinitions.find((definition) => definition.id === 'hn-best')!;
    await runFetchAttempt(hnBest, { intervalMinutes: 360, consecutiveFailures: 0, rankLimit: 100 }, async () => [
      { url: 'https://example.com/hn', title: 'Ranked post', externalId: 'hn-1', raw: {} },
    ]);
    const app = await useServer({ translateTexts: fakeTranslator() });
    await app.inject({ method: 'POST', url: '/api/entries/1/translation' });
    await app.inject({ method: 'POST', url: '/api/entries/3/translation' });
    await app.inject({ method: 'PUT', url: '/api/entries/1/bookmark' });

    const timeline = (await app.inject('/api/feeds/geeknews/entries')).json<EntryView[]>();
    expect(timeline.map((item) => [item.id, item.translatedTitle])).toEqual([
      [1, '번역: Queues in Postgres'],
      [2, null],
    ]);
    const bookmarks = (await app.inject('/api/bookmarks')).json<BookmarkedEntryView[]>();
    expect(bookmarks[0].translatedSummary).toBe('번역: Why a table can be a queue.');
    const snapshot = (await app.inject('/api/feeds/hn-best/rank-snapshot')).json<{ entries: EntryView[] }>();
    expect(snapshot.entries[0].translatedTitle).toBe('번역: Ranked post');
    expect((await app.inject('/api/entries/3')).json<EntryView>().translatedTitle).toBe('번역: Ranked post');
  });

  function fakeTranslator(): TextTranslator {
    return async (texts) => texts.map((text) => `번역: ${text}`);
  }
});
