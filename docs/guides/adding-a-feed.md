# 새 Feed 추가하기

이 문서만 보고 새 Feed를 연동할 수 있게 쓴 지침서다. 용어는 [CONTEXT.md](../../CONTEXT.md)를 따른다.

## 1. 먼저 알아야 할 구조

```
정보원(RSS, API, HTML) ──▶ collector ──▶ PostgreSQL ◀── app(API + 화면) ◀── 브라우저
                           (수집만)                      (조회·읽음 상태만)
```

- **collector**(`apps/backend/src/collector/`)와 **app**(`apps/backend/src/server/`, `apps/web/`)은 별도 컨테이너다. 둘은 DB로만 연결된다.
  Feed를 추가하는 일은 거의 전부 collector 쪽이다. app과 화면은 고칠 필요가 없다.
- collector는 상주하면서 30초마다 `feed.next_run_at`이 지난 Feed를 찾아 **하나씩** 수집한다.
- Feed 하나를 한 번 수집하는 것을 **Fetch Attempt**라 하고, 성공이든 실패든 `fetch_attempt`에 한 행이 남는다.

그림으로 보려면 [docs/diagrams/](../diagrams/)의 세 다이어그램을 연다.

### Fetch Attempt 한 번의 흐름

`apps/backend/src/collector/fetch-attempt.ts`의 `runFetchAttempt`가 한다.

1. `fetch_attempt`에 `running` 행을 넣는다.
2. Feed 선언의 `handler`로 등록된 **Handler**를 부른다. Handler는 **EntryDraft 목록만** 돌려준다.
3. 0건이면 실패다(`allowEmpty: true`인 Feed는 예외).
4. EntryDraft를 게시 시각순으로 `entry`에 넣는다. 이미 있는 항목(같은 Dedup Key)은 조용히 건너뛴다.
5. 결과를 기록한다.
   - 성공: `fetch_attempt.status = success`, `feed.consecutive_failures = 0`, `next_run_at = 지금 + 주기`
   - 실패: `status = failed`와 오류 메시지, `consecutive_failures + 1`, `next_run_at = 지금 + min(5분 × 3^(연속 실패−1), 주기)`

### 역할 경계 (ADR-0006)

| 누가 | 하는 일 |
|---|---|
| **Handler** | 정보원을 호출해 응답을 EntryDraft 목록으로 바꾼다. **이것만** 한다 |
| **공통 HTTP 클라이언트**(`http-client.ts`) | 타임아웃 10초, 재시도 2회(네트워크 오류·408·425·429·5xx만) |
| **코어**(`fetch-attempt.ts`) | 0건 판정, Dedup Key 계산, 저장, Fetch Attempt 기록, 다음 실행 시각 |
| **DB 제약** | `UNIQUE(feed_id, dedup_key)`로 중복 방어 |

Handler 안에서 재시도·타임아웃·저장·중복 확인을 직접 구현하지 않는다.

## 2. 공통 형태: EntryDraft

모든 Handler는 정보원이 무엇이든 이 형태로 돌려준다(`apps/backend/src/collector/handlers/define-handler.ts`).

| 필드 | 필수 | 넣는 값 |
|---|---|---|
| `url` | ✅ | 원문 링크. 화면에서 제목을 누르면 여기로 간다 |
| `title` | ✅ | 제목 |
| `externalId` | | 정보원이 주는 고유 ID(글 번호, 영상 ID, guid). **있으면 반드시 넣는다.** 없으면 정규화한 URL로 중복을 판정한다 |
| `publishedAt` | | 정보원이 준 게시 시각(`Date`). 표시용이다. 정렬은 처음 수집한 순서(First Seen)로 한다 |
| `author` | | 작성자 이름 하나(문자열) |
| `summary` | | 짧은 **평문** 요약. `toSummaryText(html)`(`summary-text.ts`)로 만든다. 태그를 걷고 공백을 합쳐 500자로 자른다 |
| `extra` | | Feed 고유 필드 중 **화면에 보여 줄 것**(예: HN의 `score`, `commentCount`, `commentsUrl`) |
| `raw` | ✅ | 정보원이 준 원본 그대로. 내부 보존용이며 API로 나가지 않는다(ADR-0003) |

화면(`apps/web/src/entry-card.tsx`)은 `extra`의 `score`, `commentCount`, `commentsUrl`을 알아서 보여 준다.
그래서 인기도(추천수, 좋아요, 기간 내 스타 수)는 `score`에, 댓글 수는 `commentCount`에 넣는다.
다른 필드를 화면에 보이려면 그때 `entry-card.tsx`를 고친다.

## 3. 어떤 경우인가

```
정보원이 RSS나 Atom을 주는가?
├─ 예 → [A] 선언 한 줄만 추가 (YouTube 채널도 여기)
└─ 아니오 → 기존 Handler 중 파라미터만 바꿔 쓸 수 있는 게 있는가? (예: hackernews의 section)
            ├─ 예 → [A] 선언 한 줄만 추가
            └─ 아니오 → [B] 새 Handler 작성 + 선언 추가
```

지금 있는 Handler:

| 이름 | 파일 | 파라미터 | 쓰는 곳 |
|---|---|---|---|
| `rss` | `rss-handler.ts` | `{ url }` | RSS·Atom 전부. YouTube 채널은 `https://www.youtube.com/feeds/videos.xml?channel_id=<채널ID>` |
| `hackernews` | `hackernews-handler.ts` | `{ section: 'best' \| 'show' }` | Hacker News 공식 API |
| `openrouter-models` | `openrouter-models-handler.ts` | `{}` | OpenRouter 모델 목록 API |
| `huggingface-papers` | `huggingface-papers-handler.ts` | `{ period: 'week' \| 'month' }` | HF Papers API. 지난주·지난달 추천수 상위 30편 |
| `hellogithub` | `hellogithub-handler.ts` | `{}` | HelloGitHub 추천 저장소 API |
| `devto` | `devto-handler.ts` | `{ topDays }` | dev.to API. 최근 N일 반응 상위 30개 |
| `github-trending` | `github-trending-handler.ts` | `{ since: 'daily' \| 'weekly' \| 'monthly' }` | GitHub Trending HTML |
| `trendshift` | `trendshift-handler.ts` | `{}` | Trendshift 첫 화면의 JSON-LD |
| `indiehackers` | `indiehackers-handler.ts` | `{}` | Indie Hackers 지난주 인기글 HTML |
| `anthropic-news` | `anthropic-news-handler.ts` | `{}` | Anthropic 뉴스 목록 HTML |

RSS가 없는 사이트는 RSSHub 라우트(`lib/routes/<site>/`)를 열어 **어떤 주소를 호출하는지만** 참고한다.
RSSHub는 AGPL-3.0이므로 코드를 복사하지 않는다(ADR-0006). 공식 RSS가 있으면 RSSHub를 거치지 말고 그것을 쓴다.

## 4. [A] 기존 Handler로 Feed 추가

**고칠 파일은 `apps/backend/src/feed-definitions.ts` 하나다. DB는 직접 건드리지 않는다.**

```ts
export const feedDefinitions: FeedDefinition[] = [
  // ... 기존 Feed
  {
    id: 'openai-news',              // 영구 식별자. 한 번 정하면 바꾸지 않는다
    title: 'OpenAI News',           // 화면 왼쪽 목록에 보이는 이름
    handler: 'rss',                 // apps/backend/src/collector/handlers/index.ts에 등록된 이름
    params: { url: 'https://openai.com/news/rss.xml' },  // handler에 맞지 않으면 컴파일 오류
    intervalMinutes: 120,           // 처음 만들 때의 수집 주기(분)
    // allowEmpty: true,            // 새 글이 원래 드물어 0건이 정상인 Feed만
  },
];
```

- `id`: 소문자와 `-`로 짓는다. 바꾸면 기존 Entry와 연결이 끊긴 **새 Feed**가 된다.
- `intervalMinutes`: Feed를 **처음 DB에 넣을 때만** 쓰인다. 이후 주기는 DB 값이 원본이다(5장 참고).
- 배열 순서가 화면 왼쪽 목록의 순서다.

수집기가 시작할 때 DB에 없는 Feed만 `feed` 테이블에 넣는다(`insertMissingFeeds`). 그래서 DB 작업이 필요 없다.
막 추가한 Feed의 `next_run_at`은 "지금"이라서 수집기가 곧바로 첫 수집을 한다.

## 5. [B] 새 Handler 작성

### 5-1. Handler 파일

`apps/backend/src/collector/handlers/<이름>-handler.ts`를 만든다. 아래는 JSON API를 가정한 예시다. 필드 이름은 실제 응답을 보고 맞춘다.

```ts
/** Example 사이트의 인기 글 목록을 공개 JSON API로 가져오는 Handler. */
import { defineHandler } from './define-handler.ts';

/** API 응답 중 쓰는 필드. 응답 전체를 타입으로 옮기지 않는다. */
type ExampleStory = { id: string; title: string; url: string; created_at: string; score: number };

export const exampleHandler = defineHandler<{ period: 'day' | 'week' }>({
  async fetchEntries({ period }, { httpClient }) {
    // 주입받은 httpClient만 쓴다. 타임아웃·재시도는 이미 걸려 있다.
    const stories = await httpClient<ExampleStory[]>(`https://example.com/api/top.json?period=${period}`);
    return stories.map((story) => ({
      url: story.url,
      title: story.title,
      externalId: story.id,
      publishedAt: new Date(story.created_at),
      extra: { score: story.score },
      raw: story,
    }));
  },
});
```

지킬 것:

- 파라미터 타입(`defineHandler<{ … }>`)을 반드시 선언한다. Feed 선언이 이 타입으로 검사된다.
- HTML은 `httpClient(url, { responseType: 'text' })`로 받아 `cheerio`로 파싱한다.
  파싱은 `parse…Page(html)` 함수로 따로 export해서 HTML 조각으로 테스트한다(`github-trending-handler.ts` 참고).
  페이지에 JSON-LD나 내장 JSON이 있으면 클래스 이름 대신 그것을 읽는다(`trendshift-handler.ts`). 화면 구조가 바뀌어도 덜 깨진다.
  RSS·Atom 문자열은 `rss-parser`의 `parseString`을 쓴다(`rss-handler.ts` 참고).
- 순위 목록(트렌드, 주간 인기)은 "끝난 기간"을 가져오면 몇 번을 수집해도 결과가 같다
  (`huggingface-papers-handler.ts`, `indiehackers-handler.ts`). 진행 중인 기간을 가져오면 추천수가 적을 때의 글이 먼저 들어온다.
- 요청을 여러 번 보내도 된다(목록 조회 → 항목별 조회 등). 병렬로 보낼 때는 개수에 상한을 둔다.
- 제목이나 링크가 없는 항목은 걸러서 버린다. 예외를 던지면 Fetch Attempt 전체가 실패한다.
- 예외는 잡지 않는다. 정보원이 실패하면 그대로 던지면 코어가 `failed`로 기록한다.

### 5-2. 등록

`apps/backend/src/collector/handlers/index.ts`에 한 줄을 추가한다. 디렉터리를 스캔하지 않으므로 이 줄이 없으면 쓸 수 없다.

```ts
import { exampleHandler } from './example-handler.ts';

export const handlers = {
  rss: rssHandler,
  hackernews: hackernewsHandler,
  example: exampleHandler,   // ← 이 이름이 Feed 선언의 handler 값이 된다
};
```

### 5-3. 테스트

Handler 옆에 `<이름>-handler.test.ts`를 두고, 가짜 HTTP 클라이언트로 응답 → EntryDraft 변환을 검사한다.
네트워크 없이 돌아야 한다. `hackernews-handler.test.ts`가 본보기다.

```ts
import { expect, it } from 'vitest';
import type { HttpClient } from '../http-client.ts';
import { exampleHandler } from './example-handler.ts';

it('응답을 EntryDraft로 바꾼다', async () => {
  const httpClient = (async () => [
    { id: 'a1', title: '글', url: 'https://example.com/a1', created_at: '2026-09-22T10:00:00Z', score: 7 },
  ]) as unknown as HttpClient;
  const drafts = await exampleHandler.fetchEntries({ period: 'day' }, { httpClient });
  expect(drafts[0]).toMatchObject({ url: 'https://example.com/a1', externalId: 'a1', extra: { score: 7 } });
});
```

그다음 4장처럼 `apps/backend/src/feed-definitions.ts`에 Feed를 선언한다.

## 6. 확인하기

모든 명령은 저장소 루트에서 실행한다. 로컬 스택이 떠 있어야 한다.

```bash
docker compose -f compose.yml -f compose.local.yml up -d --build
```

로컬에서는 `apps/backend/src/`를 고치면 collector가 자동으로 재시작되며 새 Feed를 DB에 넣고 곧바로 수집한다.

### 6-1. 코드 검사

```bash
npm run typecheck   # Feed 선언의 params가 handler와 맞는지까지 검사된다
npm test            # 단위 테스트 (새 Handler 테스트 포함)
npm run test:db     # DB 통합 테스트 (컨테이너에서 실행)
```

### 6-2. 한 번 수집해 보기

```bash
docker compose -f compose.yml -f compose.local.yml run --rm collector node src/collector/main.ts --once openai-news
```

`[openai-news] 새 Entry N건`이 나오면 성공이다. 한 번 더 실행하면 `0건`이어야 한다(중복 방어).
`실패`가 나오면 6-3의 쿼리로 오류 메시지를 본다.

### 6-3. DB에서 상태 보기

```bash
docker compose -f compose.yml -f compose.local.yml exec postgres \
  psql -U signal_archive -d signal_archive
```

```sql
-- Feed의 현재 상태: 주기, 다음 실행, 연속 실패
select id, interval_minutes, next_run_at, consecutive_failures from feed where id = 'openai-news';

-- 최근 Fetch Attempt: 언제, 어떤 결과, 몇 건, 무슨 오류
select status, started_at, finished_at, inserted_entry_count, error_message
from fetch_attempt where feed_id = 'openai-news' order by id desc limit 10;

-- 저장된 Entry가 제대로 들어왔는지
select id, title, url, published_at, dedup_key, extra
from entry where feed_id = 'openai-news' order by id desc limit 5;
```

확인할 점:

- `dedup_key`가 `ext:…`로 시작하는지. `url:…`이면 `externalId`를 못 채운 것이다(정보원이 ID를 안 주면 정상).
- `title`, `url`, `published_at`이 비어 있지 않은지.
- `extra`에 화면에 보일 값이 들어 있는지.

### 6-4. 화면에서 보기

`http://localhost:8000`(또는 `.env`의 `APP_PORT`)을 연다. 왼쪽 목록에 새 Feed가 안 읽음 수와 함께 보여야 한다.
연속 실패가 있으면 이름 옆에 ⚠와 횟수가 뜨고, 마우스를 올리면 다음 시도 시각이 보인다.

## 7. 운영 중에 하는 일

| 하고 싶은 것 | 방법 |
|---|---|
| 수집 주기 바꾸기 | `update feed set interval_minutes = 30 where id = 'openai-news';` (코드의 `intervalMinutes`를 바꿔도 이미 있는 Feed에는 반영되지 않는다) |
| 지금 바로 다시 수집 | `update feed set next_run_at = now() where id = 'openai-news';` 또는 6-2의 `--once` |
| Feed 그만 받기 | `feed-definitions.ts`에서 선언을 뺀다. 수집과 화면 표시가 멈추고 데이터는 남는다 |
| Feed 다시 받기 | 같은 `id`로 선언을 되살린다. 기존 Entry와 읽음 상태가 이어진다 |
| 망가진 Feed 찾기 | `select id, consecutive_failures from feed where consecutive_failures > 0;` |

**하지 말 것**

- Feed `id` 바꾸기: 새 Feed가 되고 기존 Entry와 읽음 상태가 끊긴다.
- `entry`나 `feed`에 손으로 INSERT하기: Feed 등록은 수집기가 하고, Entry는 Fetch Attempt로만 들어온다.

## 8. DB 스키마를 바꿔야 할 때

보통은 필요 없다. Feed 고유 필드는 `extra`에, 원본은 `raw`에 넣는다(ADR-0003).
**모든 Feed에 공통인** 새 필드가 생겼을 때만 스키마를 바꾼다.

1. `apps/backend/src/db/schema.ts`를 고친다.
2. `npm run db:generate`로 `apps/backend/drizzle/`에 마이그레이션 SQL을 만든다. 생성된 SQL을 읽어 보고 커밋한다.
3. `docker compose -f compose.yml -f compose.local.yml up -d --build`를 실행하면 `migrate` 컨테이너가 먼저 적용한다.
4. 화면에 내보내야 하면 `apps/backend/src/server/entry-view.ts`의 `entryViewColumns`와 `packages/api-types/src/index.ts`의 `EntryView`에 추가한다.

## 9. 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| `Handler가 0건을 돌려줬습니다` | 정보원 구조가 바뀌어 파싱이 빈 목록을 냈을 가능성이 크다. 응답을 직접 받아 보고 Handler를 고친다. 원래 새 글이 드문 Feed면 `allowEmpty: true` |
| `FetchError … 404` / `403` | 주소가 바뀌었거나 봇을 막는다. 4xx는 재시도하지 않는다. 주소를 확인하거나 요청 헤더를 넘긴다(`httpClient(url, { headers })`) |
| 같은 글이 계속 새 Entry로 들어온다 | `externalId`가 매번 바뀌거나 비어 있고 URL에 매번 다른 값이 붙는다. 안정적인 ID를 `externalId`로 넣는다 |
| 화면에서 순서가 이상하다 | 정렬은 처음 수집한 순서다. 한 번에 들어온 항목끼리는 `publishedAt`순이다. `publishedAt`이 빠졌는지 확인한다 |
| 선언했는데 목록에 안 보인다 | collector가 재시작되지 않아 DB에 안 들어갔다. `docker compose … restart collector` 또는 `--once`를 한 번 실행한다 |

## 체크리스트

- [ ] RSS·기존 Handler로 되는지 먼저 확인했다
- [ ] (새 Handler라면) 파일 작성, `handlers/index.ts` 등록, 테스트 추가
- [ ] `apps/backend/src/feed-definitions.ts`에 `id`(영구), `title`, `handler`, `params`, `intervalMinutes` 선언
- [ ] `npm run typecheck`, `npm test`, `npm run test:db` 통과
- [ ] `--once`로 N건 저장, 한 번 더 실행해 0건 확인
- [ ] DB에서 `dedup_key`, `title`, `url`, `published_at`, `extra` 확인
- [ ] 화면 왼쪽 목록에 보이고 제목을 누르면 원문이 열림
- [ ] [docs/feeds.md](../feeds.md)에 이 Feed의 출처·가져오는 방식·주기·새 Entry가 생기는 때를 적음
