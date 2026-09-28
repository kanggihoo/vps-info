# Handoff

새 세션이나 다른 사람이 이어받을 때 먼저 읽는 문서. 지금까지 한 일, 정해야 할 것, 해 볼 만한 것을 적는다.
작업이 끝나거나 결정이 나면 이 문서에서 지운다. 확정된 설계는 여기가 아니라 CONTEXT.md와 ADR에 둔다.

기록일: 2026-09-28

## 먼저 읽을 문서

| 문서 | 내용 |
|---|---|
| [CONTEXT.md](../CONTEXT.md) | 도메인 용어(Feed, Entry, Handler, Dedup Key, First Seen, Read Cursor, Opened At, Bookmark, Fetch Attempt) |
| [docs/adr/](./adr/) | 확정된 아키텍처 결정 0001–0008 |
| [docs/adr/decisions-later.md](./adr/decisions-later.md) | 미뤄 둔 결정 |
| [docs/feeds.md](./feeds.md) | 지금 수집하는 Feed 목록과 각 Feed의 출처·주기 |
| [docs/guides/adding-a-feed.md](./guides/adding-a-feed.md) | Feed·Handler 추가 절차와 검증 방법 |
| [docs/conventions/typescript.md](./conventions/typescript.md) | 코드 규칙 |
| [apps/web/DESIGN.md](../apps/web/DESIGN.md) | 화면 디자인 토큰과 규칙 |
| [docs/diagrams/](./diagrams/) | 구조·수명주기·Fetch Attempt 시퀀스 다이어그램 |

## 1. 지금까지 한 것

### 설계와 구현 (main에 커밋·push됨)

- 아키텍처를 처음부터 다시 설계했다.
  - 결정은 ADR 0001–0006과 CONTEXT.md에 있다.
  - 옛 Python 코드는 모두 지웠다.
- TypeScript로 새로 구현했다. 빌드 없이 Node가 `.ts`를 직접 실행한다.
  - **collector**
    - 상주 컨테이너 하나가 30초마다 `feed.next_run_at`이 지난 Feed를 하나씩 수집한다.
    - 실패하면 백오프하고, 매 시도를 `fetch_attempt`에 1행씩 남긴다.
  - **app**
    - Fastify API와 React 채팅형 화면으로 이루어져 있다.
    - 화면은 오래된 글이 위에 오고, "여기부터 새 글" 구분선에서 열린다.
    - Read Cursor는 스크롤에 따라 움직인다. Bookmark는 모든 Feed의 것을 한곳에 모아 본다.
  - **DB**
    - PostgreSQL과 Drizzle을 쓴다. 마이그레이션은 `migrate` 서비스가 한 번 실행한다.
- 테스트
  - 단위 테스트: `npm test`
  - DB 통합 테스트: `npm run test:db`. 별도 `_test` DB를 쓰는 컨테이너에서 돈다.

### Feed 추가 (커밋 8aef758)

- `cheerio`를 추가했다.
- 공통 요약 변환 `summary-text.ts`를 만들었다.
  - rss-parser의 `contentSnippet`이 Product Hunt의 첫 문단을 잃는 문제가 있어서다.
- Handler 8개를 새로 만들었다.
- 로컬 DB에서 확인한 결과
  - 모든 Feed가 첫 `--once`에서 데이터를 저장했고, 두 번째 실행은 0건이었다.
  - 테스트 46개(단위 27 + DB 19)가 통과했다.

Feed별 출처, 가져오는 방식, 주기는 [feeds.md](./feeds.md)에 있다.

### 화면 디자인 시스템 (ADR-0007)

- `apps/web/DESIGN.md`에 Mintlify 기반 토큰(YAML)과 규칙을 두었다. 다크 값은 직접 정했다.
- `npm run design:tokens`가 토큰으로 `apps/web/src/styles/`의 CSS 변수와 글자 단계 목록을 만든다. 어긋나면 `npm test`가 실패한다.
- Tailwind v4, shadcn/ui(radix-vega: button·badge·skeleton·tooltip), lucide-react, Geist·Pretendard(자체 서빙)를 붙였다.
- 기존 화면을 모두 옮기면서 스켈레톤·빈 상태·오류+다시 시도·다크 모드 토글·24시간제 시각을 넣었다.
- 확인: 타입 검사, 단위 테스트, `vite build`, Docker 이미지 빌드, headless Chrome으로 라이트·다크·390px 화면.
  연속 실패 툴팁과 키보드 포커스 링은 화면으로 확인하지 못했다(실패 중인 Feed가 없었다).
- 도구 문제
  - shadcn 컴포넌트는 `npm run ui:add -- <이름>`으로 받는다. 레지스트리 파일이 shadcn의 새 `cn` 패키지를 직접 import해서, 그대로 두면 우리 글자 단계 등록을 거치지 않는다(ADR-0007).
  - Windows에서 `npx @google/design.md`는 아무 출력 없이 끝난다(실행 파일 이름이 `.md`라서로 보임). `npm run design:lint`는 `designmd` 별칭으로 부른다.

### 모노레포 분리 (ADR-0008)

- `apps/backend`(server + collector), `apps/web`, `packages/api-types`로 나눴다. 루트는 워크스페이스와 위임 스크립트만 둔다.
- 확인: 타입 검사(워크스페이스 3개), 단위 테스트 33개, DB 통합 테스트 포함 52개(`test:db`), Docker 이미지 빌드,
  app 컨테이너의 `/api/health`·화면 서빙, 실행 이미지에 화면 패키지가 없는지(`node_modules` 57MB).

### 조사하면서 알게 된 것

- **Indie Hackers**
  - 비공식 피드 `feed.indiehackers.world`는 모든 경로가 500(`error code: 1101`)을 돌려준다.
  - Firebase는 `Permission denied`다.
  - `/newest`는 IPTV 스팸이 많아 주간 인기글(`/top/week-of-<월요일>`)을 쓴다.
- **GitHub Trending**
  - 비로그인 요청이라 daily는 9개, weekly는 18개만 온다.
  - RSSHub는 GraphQL로 정보를 보강하느라 토큰이 필요하지만, 우리는 HTML만 읽어서 토큰이 필요 없다.
- **Trendshift**
  - RSS도 API도 없지만 페이지에 schema.org `ItemList` JSON-LD가 있어서 그것을 읽는다.
- **연합뉴스**
  - 섹션 RSS의 분류가 부정확하다.
    - `industry.xml`에 부고, e스포츠, 정치 기사가 섞여 있다.
    - `international.xml`의 링크가 최신기사 피드와 같다.
  - IT·과학 RSS는 404다. 그래서 아직 추가하지 않았다.
- **paperswithcode.com**
  - 지금은 Hugging Face trending 페이지로 넘어간다.
- **RSSHub**
  - 소스는 `/Users/kkh/Desktop/oss-analysis/repos/rsshub/lib/routes/`에 있다.
  - AGPL이라 엔드포인트만 참고하고 코드는 복사하지 않는다(ADR-0006).

## 2. 정해야 할 것

위에서부터 답을 받으면 바로 진행할 수 있다.

1. **첫 수집분을 읽은 것으로 처리할지**
   - 문제: `openai-news`(1230건)와 `openrouter-models`(458건)처럼 과거 글 전체를 주는 Feed는 첫 수집 뒤 전부 안 읽음으로 뜬다.
   - 제안: Feed의 첫 성공 Fetch Attempt에서 Read Cursor를 그때 저장한 가장 최근 Entry로 옮긴다.
     - `fetch-attempt.ts`의 성공 트랜잭션에 몇 줄을 추가하면 된다.
     - 결정되면 CONTEXT.md의 Read Cursor 정의에도 반영한다.
2. **GitHub Trending 언어별 Feed**
   - 방식: 받을 언어를 정하면 Handler에 `language?` 파라미터를 추가한다(URL이 `/trending/<language>?since=daily`로 바뀐다).
     - 그다음 언어마다 Feed를 하나씩 선언한다.
     - 모든 언어×기간 조합을 만들지 않고, 읽을 조합만 선언한다.
   - daily/weekly/monthly는 daily 하나면 된다.
     - 처음 본 것만 기록하는 구조라서, 6시간마다 daily를 수집하면 순위에 한 번이라도 오른 저장소가 모두 쌓인다.
     - weekly Feed를 따로 두면 같은 저장소가 Feed만 다르게 중복된다.
3. **HF 논문 weekly와 monthly 중 하나**
   - 끝난 기간의 상위 30편을 가져오는 목록이라 기간이 곧 읽을 양이다. weekly는 한 달에 약 120편, monthly는 30편이다.
   - 둘 다 두지 않는다. 바꾸려면 `params: { period: 'month' }`로 한다. 새 id로 선언해야 한다.
4. **연합뉴스를 넣는 방법**
   - (a) 경제 RSS 선언 한 줄. 관련 없는 기사가 섞인다.
   - (b) IT·과학 섹션 페이지를 파싱하는 HTML Handler 하나를 만든다.
5. **테스트 파일 위치**
   - 지금은 모든 테스트를 대상 파일 옆에 둔다.
   - 제안: DB 통합 테스트(`*.db.test.ts`)와 `test-support/`만 `test/`로 옮긴다.
6. **`docs/adr/TEMPLATE.md`의 "삭제된 ADR 번호는 재사용하지 않는다" 규칙**
   - 이번 재설계에서 번호를 0001부터 다시 매겼기 때문에 규칙 문구와 맞지 않는다. 문구를 고친다.
7. **작은 이름 정리** (선택)
   - `handlers/index.ts`를 `handler-registry.ts`로 바꾼다.
   - `HandlerParams`를 `infer`로 다시 쓴다.

## 3. 해야 할 것

- [ ] **배포**
  - vps-infra nginx에 Basic Auth를 설정하고 `app:8000`으로 프록시한다(ADR-0001의 접근 제어).
  - Jenkins 파이프라인을 만든다.
  - 이미지 빌드 → `migrate` → `app`·`collector` 재시작 순서다.
- [ ] **YouTube 관심 채널 추가**
  - 채널 ID를 받으면 `rss` 선언 한 줄로 추가한다.
  - 형식: `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>`
- [ ] **화면에 `extra` 필드 더 보여 주기**
  - 지금은 `score`, `commentCount`, `commentsUrl`만 보인다.
  - GitHub의 "기간 내 스타 수"도 `score`에 넣어서 "▲ 2527"로 보인다.
  - `language`, `stars`, `subject`, `arxivUrl` 같은 필드를 보이려면 `apps/web/src/entry-card.tsx`를 고친다.
- [ ] **Product Hunt 요약 끝의 "Discussion | Link"**
  - 피드 본문에 원래 있는 문구다. 거슬리면 없앤다.
- [ ] **문서가 코드와 어긋나지 않게 하는 장치**
  - `npm run check` 하나로 타입 검사, 테스트, `drizzle-kit check`, 문서 속 경로 존재 여부를 검사한다.
  - AGENTS.md에 "X를 바꾸면 Y 문서를 고친다" 표를 둔다.
- [ ] **로컬 Compose 네트워크 이름이 고정이라 체크아웃 두 곳의 스택이 섞인다.**
  - `compose.local.yml`의 `signal_archive_local_data`는 프로젝트 이름과 상관없이 같은 이름이다.
  - 메인 체크아웃과 worktree에서 동시에 띄우면 `postgres` 이름이 두 컨테이너로 풀려 요청이 무작위로 갈린다.
    `test:db`가 "테스트 DB가 없다"며 간헐적으로 실패한 원인이었다.
  - `name:`을 지워 네트워크를 Compose 프로젝트별로 만들면 된다. 운영 compose.yml의 외부 네트워크 이름과는 무관하다.
- [ ] **shadcn의 새 `cn` 패키지로 옮길지**
  - `cn`(shadcn·aidenybai, 2026-09-22 공개)은 clsx + tailwind-merge를 대체한다. 커스텀 글자 단계는 `cn/config`의 `createCn`으로 등록한다.
  - `cn/vite` 플러그인은 `@theme`의 `--text-*`를 읽어 자동 등록한다고 한다(확인 전). 되면 `design-token-names.ts` 생성과 `ui:add`의 import 바꾸기가 필요 없어질 수 있다.
- [ ] **모바일 Feed 탭 줄이 선택한 Feed로 스크롤되지 않는다.**
  - 탭이 많아 선택한 Feed가 화면 밖에 있으면 직접 옆으로 밀어야 한다. 선택 시 `scrollIntoView({ inline: nearest })`로 맞추면 된다.
- [ ] **알려진 한계: 타임라인 맨 아래를 보고 있을 때 새 Entry가 자동으로 붙지 않는다.**
  - Feed 목록은 60초마다 갱신되지만, 이미 열어 둔 타임라인에는 새 Entry가 추가되지 않는다.

## 4. 해 볼 만한 것

### 더 넣을 만한 Feed

RSSHub 조사에서 나온 후보다. 모두 인증 없이 가져올 수 있다.

| 대상 | 가져오는 곳 | 필요한 작업 |
|---|---|---|
| lobste.rs | `https://lobste.rs/rss` | `rss` 선언 |
| DeepMind 블로그 | `https://www.deepmind.com/blog/rss.xml` | `rss` 선언 |
| The Verge | `https://www.theverge.com/rss/index.xml` | `rss` 선언 |
| Hugging Face 블로그 | `https://huggingface.co/api/blog` | JSON Handler |
| Ollama 새 모델 | `https://ollama.com/library?sort=newest` | HTML Handler |
| Cursor 변경 이력 | `https://cursor.com/changelog` | HTML Handler |
| Claude 블로그 | `https://claude.com/blog` | HTML Handler |
| arXiv 분야별 새 논문 | `https://export.arxiv.org/api/query` 또는 `rss.arxiv.org/rss/cs.CL` | `rss` 선언. 하루 수백 건이라 양이 많다 |
| Reddit 서브레딧 | `https://www.reddit.com/r/<name>/.rss` | `rss` 선언 |
| Product Hunt 오늘 순위와 추천수 | 홈페이지 안의 JSON | HTML Handler(RSSHub `producthunt/today.tsx`) |

### 기능

- **Markdown 내보내기**: Q7의 결정이다. Feed 전체, 선택한 Entry, Bookmark 중 범위와 형식을 아직 정하지 않았다.
- **수집 상태 화면**: Feed별 최근 Fetch Attempt, 실패 메시지, 다음 실행 시각을 보여 준다. 지금은 psql로 봐야 한다.
- **HTML Handler 깨짐 알림**: HTML은 페이지 구조가 바뀌면 조용히 0건이 되고 실패로 기록된다.
  - 연속 실패가 N회를 넘으면 알림을 보내는 식이다. 알림 채널은 아직 없다.
- **Feed가 많아질 때의 사이드바**: 지금은 분류 없는 평면 목록이다(Q17).
  - 언어별 트렌드 등으로 20개를 넘으면 묶음이나 분류를 다시 결정한다.

## 로컬에서 바로 확인하기

```sh
APP_PORT=8001 docker compose -f compose.yml -f compose.local.yml up -d --build   # 8000은 다른 프로젝트가 사용 중
open http://localhost:8001
docker compose -f compose.yml -f compose.local.yml run --rm collector node src/collector/main.ts --once <feed-id>
npm run typecheck && npm test && npm run test:db
docker compose -f compose.yml -f compose.local.yml down
```
