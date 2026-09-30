# 등록된 Feed

지금 수집하는 Feed 목록을 사람이 읽기 좋게 정리한 문서다. 실제 선언은 [`apps/backend/src/feed-definitions.ts`](../apps/backend/src/feed-definitions.ts)에 있다.
Feed를 추가하거나 빼거나 파라미터를 바꾸면 이 문서도 같이 고친다.

- **종류**: Stream은 새 Entry를 쌓아 시간순으로 읽고, Ranked는 수집할 때마다 순위표(Rank Snapshot)를 남겨 직전 수집과 비교한 순위 변동으로 본다(ADR-0009).
- **주기**와 Ranked Feed의 **순위 수**는 처음 등록할 때의 값이다. 운영 중에 DB에서 바꿨다면 DB 값이 우선한다
  ([지침서 7장](./guides/adding-a-feed.md) 참고).
- **새 Entry가 생기는 때**는 수집한 목록에 이전에 없던 항목이 나타난 때다. 같은 항목은 한 Feed 안에서 한 번만 저장된다(ADR-0002).
- **첫 수집**은 로컬에서 처음 수집했을 때(2026-09-28, Trendshift는 2026-09-29) 저장된 건수다. HN은 그 전부터 수집하던 것이라 비워 둔다.
- **Feed Group**: 한 정보원의 여러 Feed는 화면 왼쪽에서 한 줄로 묶이고, 가운데 위쪽 탭·드롭다운으로 고른다(ADR-0010).
  지금 Group은 Hacker News(Best·Show)와 Trendshift(기간 × 언어 9개) 둘이다.

## 한눈에 보기

| Feed | 무엇 | 종류 | 가져오는 방식 | 주기 | 첫 수집 |
|---|---|---|---|---|---|
| Hacker News Best | HN 추천 상위 글 100개 | Ranked | 공식 API | 6시간 | – |
| Show HN | HN에 직접 만든 것을 소개하는 글 60개 | Ranked | 공식 API | 6시간 | – |
| GeekNews | 한국어 개발·기술 뉴스 | Stream | 공식 RSS | 1시간 | 50 |
| Product Hunt | 추천된 새 제품 | Stream | 공식 Atom | 3시간 | 50 |
| TechCrunch | 기술 산업 뉴스 | Stream | 공식 RSS | 1시간 | 20 |
| OpenAI News | OpenAI 공지·연구·사례 | Stream | 공식 RSS | 6시간 | 1230 |
| Claude Code 릴리스 | Claude Code 버전별 변경 사항 | Stream | GitHub 릴리스 Atom | 6시간 | 10 |
| OpenRouter 새 모델 | OpenRouter에 추가된 LLM 모델 | Stream | 공개 API | 6시간 | 458 |
| Hugging Face 주간 인기 논문 | 지난주 추천수 상위 AI 논문 30편 | Stream | 공개 API | 12시간 | 30 |
| HelloGitHub | 사람이 골라 소개하는 오픈소스 저장소 | Stream | 공개 API | 1일 | 20 |
| dev.to 주간 인기글 | 최근 7일 반응 상위 개발 글 60개 | Ranked | 공개 API | 6시간 | 30 |
| Trendshift 주간 (전체·TypeScript·Python) | 이번 주 Trendshift 점수 상위 GitHub 저장소 25개 | Ranked | HTML 안의 RSC 데이터 | 6시간 | 25씩 |
| Trendshift 월간 (전체·TypeScript·Python) | 이번 달 점수 상위 저장소 25개 | Ranked | HTML 안의 RSC 데이터 | 12시간 | 25씩 |
| Trendshift 연간 (전체·TypeScript·Python) | 올해 점수 상위 저장소 25개 | Ranked | HTML 안의 RSC 데이터 | 1일 | 25씩 |
| Indie Hackers 주간 인기글 | 지난주 인기 1인 창업·사이드 프로젝트 글 | Stream | HTML 파싱 | 12시간 | 20 |
| Anthropic News | Anthropic 공지·연구 | Stream | HTML 파싱 | 6시간 | 10 |

## Feed별 설명

### 개발·기술 뉴스

**Hacker News Best** (`hn-best`, Ranked)
- 출처: [news.ycombinator.com/best](https://news.ycombinator.com/best)
- 가져오기: 공식 API(`hacker-news.firebaseio.com/v0/beststories.json`)로 상위 `rank_limit`개(처음 100)를 가져온다. 목록은 최대 약 200개이고 글마다 요청이 하나씩 나간다.
- 순위: best는 최근 며칠 동안 표를 많이 받은 글을 계속 다시 계산한 목록이라 하루 안에서도 순서가 바뀐다.
- 새 Entry: 상위 `rank_limit`위 안에 처음 들어온 글. 그 밖에서 올라왔다 사라진 글은 놓친다.
- 화면: 순위표. 순위 변동, NEW·재진입, 최신 점수와 직전 대비 증감, 댓글 수를 보여 준다. 댓글 수를 누르면 HN 토론 페이지로 간다.

**Show HN** (`hn-show`, Ranked)
- 출처: [news.ycombinator.com/show](https://news.ycombinator.com/show)
- 나머지는 Hacker News Best와 같다(API 목록 `showstories.json`, 처음 60개).

**GeekNews** (`geeknews`)
- 출처: [news.hada.io](https://news.hada.io)
- 가져오기: 공식 RSS `https://news.hada.io/rss/news`. 최근 50건이 온다.
- 새 Entry: GeekNews에 새로 올라온 글. 요약에 원문 요약 문단이 들어간다.

**TechCrunch** (`techcrunch`)
- 출처: [techcrunch.com](https://techcrunch.com)
- 가져오기: 공식 RSS `https://techcrunch.com/feed/`. 최근 20건이 온다.
- 새 Entry: 새 기사.

**dev.to 주간 인기글** (`devto-top-week`, Ranked)
- 출처: [dev.to/top/week](https://dev.to/top/week)
- 가져오기: 공개 API `https://dev.to/api/articles?top=7&per_page=<rank_limit>`(처음 60)
- 새 Entry: 최근 7일 반응 상위 `rank_limit`개에 처음 든 글. 주기마다 순위가 바뀌므로 한 주 동안 조금씩 들어온다.
- 화면: 순위표. 반응 수(▲)와 직전 대비 증감, 댓글 수를 보여 준다.

**Indie Hackers 주간 인기글** (`indiehackers-top-week`)
- 출처: [indiehackers.com/top/week-of-…](https://www.indiehackers.com)
- 가져오기: 지난주 인기글 페이지 `/top/week-of-<지난주 월요일>`의 HTML을 파싱한다. 공식 RSS·API가 없고 비공식 피드도 동작하지 않는다.
- 새 Entry: 주가 바뀐 뒤 첫 수집 때 지난주 인기글 20개가 한꺼번에 들어온다. 그 주 동안은 0건이다.
- 참고: 최신글(`/newest`)은 스팸이 많아서 쓰지 않는다.
- 화면: 좋아요 수(▲)와 댓글 수를 보여 준다.

### 제품·오픈소스

**Product Hunt** (`producthunt`)
- 출처: [producthunt.com](https://www.producthunt.com)
- 가져오기: 공식 Atom `https://www.producthunt.com/feed`. 추천된 제품 50개가 온다.
- 새 Entry: 추천 목록에 새로 오른 제품. 목록의 게시일이 몇 주씩 섞여 있어 "오늘 출시"와는 다르다.
- 참고: 추천수(vote)는 피드에 없다. 요약 끝에 "Discussion | Link"가 붙는다. 원문 페이지가 제품 화면이라 화면에서 읽기 버튼을 숨긴다.

**Trendshift** (Feed Group, Ranked Feed 9개)
- Feed: 기간(`weekly`·`monthly`·`yearly`) × 언어(전체·TypeScript·Python).
  id는 `trendshift-<기간>`(전체 언어)과 `trendshift-<기간>-<언어 소문자>`다(`trendshift-weekly`, `trendshift-yearly-python`).
- 출처: [trendshift.io/weekly](https://trendshift.io/weekly), `/monthly`, `/yearly`. 언어는 `?language=TypeScript`처럼 붙인다.
- 가져오기: 페이지 HTML에 들어 있는 Next.js RSC 데이터(`self.__next_f.push`)의 `initialData`를 읽는다. 25개가 온다.
  순위, Trendshift 점수, 그 기간에 늘어난 스타, 전체 스타·포크, 설명, 태그가 여기에만 있다.
  RSC 데이터를 읽지 못하면 schema.org `ItemList`(JSON-LD)로 순위와 저장소만 읽고 수집기 로그에 `[trendshift] … JSON-LD로 읽었다`를 남긴다.
  그 회차의 Rank Snapshot에는 수치가 없어 화면에 순위 변동만 보인다. 경고가 보이면 Handler를 고친다.
- 순위: GitHub Trending과 다른, Trendshift 자체 점수 순위다. 주간은 월요일(UTC), 월간은 매달 1일, 연간은 1월 1일에 새 기간이 시작된다.
- 새 Entry: 순위에 처음 오른 저장소. **기간이 바뀐 뒤 첫 수집에서는 순위표 대부분이 한꺼번에 NEW로 뜬다.** 고장이 아니라 새 기간의 순위표라서다.
- 주기: 기간이 길수록 순위가 천천히 바뀌어 주간 6시간, 월간 12시간, 연간 1일로 둔다.
- 참고: 일간(첫 화면)은 수집하지 않는다. 링크는 GitHub 저장소로 가고, Trendshift 저장소 페이지 주소·언어·태그는 `extra`에, 점수·스타·포크는 `metrics`에 저장한다.
  예전의 `github-trending-daily`(GitHub Trending 일간)와 `trendshift`(Trendshift 첫 화면) Feed는 2026-09-29에 이 Feed들로 바꾸면서 지웠다(마이그레이션 `0003`).
- 화면: 저장소 카드의 순위표. 언어, 전체 스타, 그 기간에 늘어난 스타와 직전 대비 증감, 포크, 태그를 보여 준다.

**HelloGitHub** (`hellogithub`)
- 출처: [hellogithub.com](https://hellogithub.com)
- 가져오기: 공개 API `https://api.hellogithub.com/v1/?sort_by=featured&page=1`. 20개가 온다.
- 새 Entry: 새로 추천된 저장소. 한 달에 한 번 묶음으로 올라오는 편이다.
- 참고: 제목과 요약은 영어판이 있으면 영어, 없으면 중국어다. 링크는 GitHub 저장소로 간다.

### AI·LLM

**OpenAI News** (`openai-news`)
- 출처: [openai.com/news](https://openai.com/news)
- 가져오기: 공식 RSS `https://openai.com/news/rss.xml`
- 새 Entry: 새 글.
- 게시일 하한: `2026-01-01`. RSS에 2015년부터의 글 전체(1230건)가 들어 있어서, 그 이전 글은 저장하지 않는다.
  처음 받아 둔 이전 글은 마이그레이션 `0004`에서 지웠다(Bookmark했거나 연 글은 남김).

**Anthropic News** (`anthropic-news`)
- 출처: [anthropic.com/news](https://www.anthropic.com/news)
- 가져오기: 뉴스 목록 페이지의 HTML을 파싱한다. 공식 RSS가 없다. 최근 10개가 온다.
- 새 Entry: 새 글. 분류(Announcements, Product, Science 등)는 `extra.subject`에 저장한다.

**Claude Code 릴리스** (`claude-code-releases`)
- 출처: [github.com/anthropics/claude-code/releases](https://github.com/anthropics/claude-code/releases)
- 가져오기: GitHub 릴리스 Atom `…/releases.atom`. 최근 10개 버전이 온다.
- 새 Entry: 새 버전. 요약에 변경 사항 앞부분이 들어간다.

**OpenRouter 새 모델** (`openrouter-models`)
- 출처: [openrouter.ai/models](https://openrouter.ai/models)
- 가져오기: 공개 API `https://openrouter.ai/api/v1/models`. 인증이 필요 없다. 등록된 모델 전체가 온다.
- 새 Entry: 새로 추가된 모델. 게시일은 모델이 OpenRouter에 추가된 날이다.
- 게시일 하한: `2026-01-01`. API가 매번 모델 전체를 주므로 그 이전에 추가된 모델은 저장하지 않는다. 새 모델이 없는 수집은 0건 성공이다.
  처음 받아 둔 이전 모델은 마이그레이션 `0004`에서 지웠다.
- 참고: 컨텍스트 길이와 토큰 가격은 `extra`에 저장한다. 원문 페이지가 가격표 대시보드라 화면에서 읽기 버튼을 숨긴다.

**Hugging Face 주간 인기 논문** (`hf-papers-weekly`)
- 출처: [huggingface.co/papers](https://huggingface.co/papers)
- 가져오기: 공개 API `https://huggingface.co/api/daily_papers?week=<지난주>&limit=30`. 지난 ISO 주(UTC)의 추천수 상위 30편이다.
- 새 Entry: 주가 바뀐 뒤 첫 수집 때 30편이 한꺼번에 들어온다. 그 주 동안은 0건이다.
- 화면: 추천수(▲)와 댓글 수를 보여 준다. 링크는 HF 논문 페이지로 가고, arXiv 주소는 `extra.arxivUrl`에 저장한다.
