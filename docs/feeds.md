# 등록된 Feed

지금 수집하는 Feed 목록을 사람이 읽기 좋게 정리한 문서다. 실제 선언은 [`apps/backend/src/feed-definitions.ts`](../apps/backend/src/feed-definitions.ts)에 있다.
Feed를 추가하거나 빼거나 파라미터를 바꾸면 이 문서도 같이 고친다.

- **종류**: Stream은 새 Entry를 쌓아 시간순으로 읽고, Ranked는 수집할 때마다 순위표(Rank Snapshot)를 남겨 직전 수집과 비교한 순위 변동으로 본다(ADR-0009).
- **주기**와 Ranked Feed의 **순위 수**는 처음 등록할 때의 값이다. 운영 중에 DB에서 바꿨다면 DB 값이 우선한다
  ([지침서 7장](./guides/adding-a-feed.md) 참고).
- **새 Entry가 생기는 때**는 수집한 목록에 이전에 없던 항목이 나타난 때다. 같은 항목은 한 Feed 안에서 한 번만 저장된다(ADR-0002).
- **첫 수집**은 로컬에서 처음 수집했을 때(2026-09-28, Trendshift는 2026-09-29) 저장된 건수다. HN은 그 전부터 수집하던 것이라 비워 둔다.
- **Feed Group**: 한 정보원의 여러 Feed는 화면 왼쪽에서 한 줄로 묶이고, 가운데 위쪽 탭·드롭다운으로 고른다(ADR-0010).
  지금 Group은 Hacker News(Best·Show), Trendshift(기간 × 언어 9개), HelloGitHub 순위(기간 × 언어 8개), 원티드(직무군 6개) 넷이다.

## 한눈에 보기

| Feed | 무엇 | 종류 | 가져오는 방식 | 주기 | 첫 수집 |
|---|---|---|---|---|---|
| Hacker News Best | HN 추천 상위 글 100개 | Ranked | 공식 API | 6시간 | – |
| Show HN | HN에 직접 만든 것을 소개하는 글 60개 | Ranked | 공식 API | 6시간 | – |
| GeekNews | 한국어 개발·기술 뉴스 | Stream | 공식 RSS | 1시간 | 50 |
| Product Hunt | 추천된 새 제품 | Stream | 공식 Atom | 3시간 | 50 |
| Product Hunt 인기 (주간·월간·연간) | 이번 주·달·해에 Featured에 오른 제품의 추천수 상위 30개 | Ranked | 공식 GraphQL API | 6시간·12시간·1일 | 30씩 |
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
| Star History 주간 급상승 | 이번 주 GitHub 스타가 가장 많이 늘어난 저장소 20개 | Ranked | HTML 파싱 | 7일 | 20 |
| HelloGitHub 월간 (전체·Python·JavaScript·Rust) | 최신 월간호에서 언어별로 고른 저장소 40개까지 | Ranked | 공개 API | 1일 | – |
| HelloGitHub 연간 (전체·Python·JavaScript·Rust) | 올해 소개된 저장소를 HelloGitHub 순서대로 40개까지 | Ranked | 공개 API | 3일 | – |
| Indie Hackers 주간 인기글 | 지난주 인기 1인 창업·사이드 프로젝트 글 | Stream | HTML 파싱 | 12시간 | 20 |
| Anthropic News | Anthropic 공지·연구 | Stream | HTML 파싱 | 6시간 | 10 |
| 원티드 신입 (백엔드·웹·프론트·AI·데이터·인프라·QA·앱) | 개발 직군 신입 지원 가능 공고, 직무군별 Feed 6개 | Stream | 사이트 내부 JSON API | 12시간 | – |
| 점핏 백엔드 신입 | 서버/백엔드 신입 공고 | Stream | 사이트 내부 JSON API | 6시간 | – |
| 사람인 백엔드 신입 | "백엔드" 검색 신입 공고 중 백엔드/서버개발 직무 | Stream | HTML 파싱 | 6시간 | – |
| 링커리어 백엔드 신입 | 백엔드/서버개발 신입 채용 공고 | Stream | 사이트 내부 GraphQL API | 6시간 | – |

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

**Product Hunt 인기** (Feed Group, Ranked Feed 3개)
- Feed: 기간(`weekly`·`monthly`·`yearly`). id는 `producthunt-<기간>`이다. 일간은 수집하지 않는다.
- 출처: [producthunt.com](https://www.producthunt.com). 사이트의 "Best of Product Hunt" 리더보드와 같은 순서다.
- 가져오기: 공식 GraphQL API(`https://api.producthunt.com/v2/api/graphql`)의 `posts(featured: true, order: VOTES, postedAfter: 기간 시작)`. 30개가 온다.
  `order: RANKING`은 일간 순위라 쓰지 않는다. 기간은 미국 태평양 시간 0시(UTC 07:00)에 시작하고 주는 월요일에 시작한다.
- 인증: 앱의 API Key·Secret으로 client credentials 토큰을 받는다(`PRODUCT_HUNT_CLIENT_ID`, `PRODUCT_HUNT_CLIENT_SECRET`). 복잡도 한도는 15분에 6250점이다.
- 참고: 이 API는 비상업 용도만 허용하고 출처 표기를 요청한다.

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

**Star History 주간 급상승** (`starhistory-weekly`, Ranked)
- 출처: [star-history.com](https://www.star-history.com) 홈의 주간 순위표
- 가져오기: 공식 API가 없어서 홈 HTML에 미리 그려진 순위표(`ol > li`)를 파싱한다. 20개가 온다. 정확한 `owner/repo`와 증가 스타(`+8,835`)는 줄마다 마우스 올림 설명에 있다.
  순위표를 찾지 못하거나 한 줄의 형식이 다르면 실패로 남긴다. 클래스 이름은 Tailwind 유틸리티라 읽지 않는다.
- 순위: 그 주(월~일 기간, 화면에 `Updated Sep 29, 2026 – Oct 5, 2026`처럼 적힌다)에 늘어난 스타 수 순서다. 주 1회만 바뀐다.
- 주기: **7일(10080분).** 다른 Ranked Feed보다 훨씬 길다. 순위 변동은 "직전 수집"과 비교하는데(ADR-0009), 정보원이 주 1회만 바뀌므로 더 자주 받으면 같은 주끼리 비교되어 변동이 모두 사라진다.
  갱신 요일이 확실하지 않아 한 주를 건너뛰거나 같은 주를 두 번 받을 수 있다. 어긋나면 관리 화면에서 주기를 바꾼다.
- 새 Entry: 순위에 처음 오른 저장소. 주가 바뀐 뒤 첫 수집에서 일부가 NEW로 뜬다.
- 참고: 링크는 GitHub 저장소로 간다. 주간 증가 스타를 `metrics.starsGained`에 저장한다. 전체 스타·포크·언어는 응답에 없다.
  사이트가 보여 주는 지난주 대비 변동(▲▼·N)은 `metrics.rankChange`(오른 칸 수, 내려가면 음수)와 `metrics.isNewToTop`에 남기지만, 화면은 아직 이 값을 쓰지 않는다.
- 화면: 저장소 카드의 순위표. 그 주에 늘어난 스타와 직전 수집 대비 증감을 보여 준다.

**HelloGitHub** (`hellogithub`)
- 출처: [hellogithub.com](https://hellogithub.com)
- 가져오기: 공개 API `https://api.hellogithub.com/v1/?sort_by=featured&page=1`. 20개가 온다.
  `rank_by`와 `tid`를 붙이지 않은 기본 목록이고, 최신 월간호 앞쪽 20개와 같다.
- 새 Entry: 새로 추천된 저장소. 한 달에 한 번(매달 28일 전후) 묶음으로 올라오는 편이다.
- 참고: 제목과 요약은 영어판이 있으면 영어, 없으면 중국어다. 링크는 GitHub 저장소로 간다.
  조회 수(`clicks`)와 댓글 수(`commentCount`)를 `metrics`에 저장한다. 이 수치는 이 Feed를 바꾼 뒤에 처음 저장된 Entry부터 있다.

**HelloGitHub 순위** (Feed Group, Ranked Feed 8개)
- Feed: 기간(`monthly`·`yearly`) × 언어(전체·Python·JavaScript·Rust).
  id는 `hellogithub-<기간>`(전체 언어)과 `hellogithub-<기간>-<언어 소문자>`다(`hellogithub-yearly`, `hellogithub-monthly-python`).
- 가져오기: 같은 공개 API에 `rank_by=monthly|yearly&tid=<태그 ID>`를 붙인다. 페이지당 20개씩 2페이지(40개)까지 받고, 다음 페이지가 없으면 멈춘다.
  `tid`는 HelloGitHub 태그 ID다: 전체 `all`, Python `Z8PipJsHCX`, JavaScript `x3YH09wlKN`, Rust `D4JBAUo967`.
  `lang`·`rank_by=weekly`처럼 모르는 파라미터는 오류 없이 무시되니, 값을 바꿀 때는 응답이 달라지는지 직접 확인한다.
- 순위: **HelloGitHub이 정한 순서**다. 조회 수 순이 아니고 정렬 기준은 알려져 있지 않다. 점수로 다시 정렬하지 않는다.
- 월간은 최신 월간호의 목록이라 한 달 동안 같다. 그래서 순위 변동은 거의 없고, 새 호가 나오는 매달 28일 전후에 NEW가 한꺼번에 뜬다.
  언어를 `tid`로 서버에서 거르므로 전체 목록 앞 20개에서 거르는 것보다 많다(Rust는 5개뿐이다).
- 지원하는 언어 태그는 Python, Java, C++, JavaScript, Rust, 그리고 Tutorial·AI·Algo·Game이다. TypeScript·Go는 없다.
- 주기: 월간 1일, 연간 3일. 목록이 천천히 바뀌어 길게 둔다.
- 화면: 저장소 카드의 순위표. 언어, HelloGitHub 조회 수, 댓글 수, HelloGitHub 링크를 보여 준다. 스타·포크는 응답에 없다.

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

### 채용 공고

신입 개발 공고를 모으는 Stream Feed다(원티드 직무군 6개, 점핏·사람인·링커리어 각 1개). 화면에서는 `job` 카드로 회사, 지역, 경력, 마감(`~10/30`, 마감일이 없으면 `상시`)과 기술스택·직무 태그를 보여 준다.
공고 링크는 지원 화면이 붙은 페이지라 읽기 버튼은 원티드(공고 데이터를 직접 읽음, ADR-0013)만 보이고 나머지는 숨긴다. 네 Feed 모두 `extra`의 필드 이름이 같다(`location`, `career`, `deadline`, `alwaysOpen`, `tags`).
공식 API가 아니라 사이트가 자기 화면에서 부르는 주소를 쓰므로, 응답이 바뀌면 해당 Handler를 고친다. 같은 공고가 여러 사이트에 올라오면 Feed마다 Entry가 따로 생긴다(ADR-0002).

**원티드 신입** (Feed Group `wanted`, Stream Feed 6개)
- Feed: 직무군별 `wanted-backend`(백엔드), `wanted-web`(웹·프론트), `wanted-ai-data`(AI·데이터), `wanted-infra`(인프라·운영), `wanted-qa-manager`(QA·매니지먼트), `wanted-app`(앱).
  직무군에 든 직무는 `feed-definitions.ts`의 `wantedRoleGroups`에 있다(예: 백엔드는 서버 개발자·소프트웨어 엔지니어·자바·Node.js·파이썬·DBA).
- 출처: [wanted.co.kr](https://www.wanted.co.kr)
- **VPS IP는 원티드가 막아서 한국 IP의 프록시를 거친다**(맥에서 실행, ADR-0014, [원티드 데이터 가져오기](./sources/wanted.md)의 8장). 맥이 켜져 있을 때만 수집한다(맥이 VPS를 깨운다).
- 가져오기: 원티드 웹이 목록 화면에서 부르는 `https://www.wanted.co.kr/api/chaos/navigation/v1/results`에 `job_group_id=518`(개발), `job_ids`(직무 ID를 반복해서 붙임), `years=0`(신입 지원 가능), 최신 등록순.
  한 번에 100개씩, 다음 페이지가 없을 때까지 받는다(최대 10페이지). 직무 하나가 아니라 여러 직무를 한꺼번에 묻는다.
- 새 Entry: 새로 등록된 공고. 경력 범위가 신입을 포함하는 공고(`신입~5년`, `경력 무관`)라 신입 전용은 아니다. **마감일은 수집에 쓰는 목록(chaos)에 없고 상세 페이지에만 있다(마감이 있는 공고는 일부).** 상세를 열면 마감일을 `extra.deadline`에 저장해 다음부터 카드에 `~10/31`로 보이고, 지나면 `마감`으로 보인다.
- 태그: 공고의 세부 직무(응답의 `category_tag`)와, 정규직이 아니면 `인턴`·`계약직`. 세부 직무는 공고가 가진 여러 직무 중 하나라서 Feed의 직무군과 다를 수 있다(예: 백엔드 Feed의 머신러닝 엔지니어).
- 겹침: 한 공고가 두 직무군에 걸리면 Feed마다 Entry가 따로 생긴다(ADR-0002). 전체 고유 공고는 340여 건이다(2026-09-30 확인).
- API 파라미터, 직군·직무 ID 표, 응답 필드 대응은 [원티드 데이터 가져오기](./sources/wanted.md)에 따로 정리했다.
- 상세: 읽기 버튼을 누르면 상세 페이지(`/wd/<id>`)의 `__NEXT_DATA__` 공고 데이터로 자격 요건, 주요 업무, 우대 사항, 채용 전형, 복지, 회사 소개를 보여 준다. 기업 자체 채용 사이트로 지원하는 공고는 `out_link`를 "기업 채용 사이트에서 지원" 링크로 붙인다.
  본문은 저장하지 않고 열 때 가져오며, 마감일만 Entry에 저장한다(ADR-0013).
- 주기: 12시간. 공고는 천천히 올라오고 Handler가 매번 열린 공고 전체(직무군당 1~2페이지)를 받아서, 주기를 늘려도 놓치는 공고가 없다. 이전에 6시간으로 들어간 Feed는 마이그레이션 `0006`이 바꾼다.
- 참고: 공식 API가 아니어서 응답이 바뀌면 깨질 수 있다. 첫 수집에서는 직무군별로 수십~170건이 한꺼번에 들어온다.

**점핏 백엔드 신입** (`jumpit-backend`)
- 출처: [jumpit.saramin.co.kr](https://jumpit.saramin.co.kr)
- 가져오기: `https://jumpit-api.saramin.co.kr/api/positions`에 `jobCategory=1`(서버/백엔드), `career=0`(신입), 최신 등록순, 첫 페이지.
- 새 Entry: 새 공고. 기술스택은 `extra.tags`, 마감일은 `extra.deadline`에 저장한다. 신입 공고가 적어서 한 번에 열 개 안팎이 온다.

**사람인 백엔드 신입** (`saramin-backend`)
- 출처: [saramin.co.kr](https://www.saramin.co.kr)
- 가져오기: 검색 결과 `/zf_user/search/recruit?searchword=백엔드&exp_cd=1&recruitSort=reg_dt`(30개)의 HTML을 파싱한다. `robots.txt`가 막지 않는 경로다.
- 새 Entry: 새 공고. 키워드 검색이 프론트엔드 공고까지 돌려주므로 직무 태그에 `백엔드/서버개발`이 있는 것만 남긴다(30개 중 25개 안팎).
- 참고: 마감 표기("~ 10/30(금)", "오늘마감", "상시채용")는 날짜나 상시로 바꾸고, 연도가 없어 한 달 넘게 지난 날짜는 다음 해로 본다. 경력은 "경력무관"이라고만 적힌 공고가 많다.

**링커리어 백엔드 신입** (`linkareer-backend`)
- 출처: [linkareer.com](https://linkareer.com/list/recruit)
- 가져오기: `https://api.linkareer.com/graphql`의 `activities` 질의(채용 `activityTypeID=5`, 진행 중, 직무 `103002` 백엔드/서버개발, 지원 자격 `NEW`, 최신순, 30개).
- 새 Entry: 새 공고. 직무 필터가 "모든 직무"로 표시한 공고도 돌려주므로 백엔드 직무를 직접 단 공고만 남긴다(30개 중 5개 안팎). 마감일이 없는 공고(상시·채용 시 마감)는 상시로 본다.

**수집하지 않는 곳**
- 로켓펀치: Cloudflare가 Node의 요청을 막는다(403). 같은 주소가 curl에서는 열려서 헤더 문제가 아니라 클라이언트 식별로 막는 것이다. 우회하지 않는다.
- 캐치·자소설닷컴: 캐치는 봇 확인 화면이 뜨고, 자소설닷컴은 목록을 브라우저가 나중에 채워서 HTML만으로는 공고가 없다.
