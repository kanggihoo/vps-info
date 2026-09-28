# 등록된 Feed

지금 수집하는 Feed 목록을 사람이 읽기 좋게 정리한 문서다. 실제 선언은 [`apps/backend/src/feed-definitions.ts`](../apps/backend/src/feed-definitions.ts)에 있다.
Feed를 추가하거나 빼거나 파라미터를 바꾸면 이 문서도 같이 고친다.

- **주기**는 처음 등록할 때의 값이다. 운영 중에 DB에서 바꿨다면 DB 값이 우선한다
  ([지침서 5장](./guides/adding-a-feed.md) 참고).
- **새 Entry가 생기는 때**는 수집한 목록에 이전에 없던 항목이 나타난 때다. 같은 항목은 한 Feed 안에서 한 번만 저장된다(ADR-0002).
- **첫 수집**은 로컬에서 처음 수집했을 때(2026-09-28) 저장된 건수다. HN은 그 전부터 수집하던 것이라 비워 둔다.

## 한눈에 보기

| Feed | 무엇 | 가져오는 방식 | 주기 | 첫 수집 |
|---|---|---|---|---|
| Hacker News Best | HN 추천 상위 글 | 공식 API | 1시간 | – |
| Show HN | HN에 직접 만든 것을 소개하는 글 | 공식 API | 1시간 | – |
| GeekNews | 한국어 개발·기술 뉴스 | 공식 RSS | 1시간 | 50 |
| Product Hunt | 추천된 새 제품 | 공식 Atom | 3시간 | 50 |
| TechCrunch | 기술 산업 뉴스 | 공식 RSS | 1시간 | 20 |
| OpenAI News | OpenAI 공지·연구·사례 | 공식 RSS | 6시간 | 1230 |
| Claude Code 릴리스 | Claude Code 버전별 변경 사항 | GitHub 릴리스 Atom | 6시간 | 10 |
| OpenRouter 새 모델 | OpenRouter에 추가된 LLM 모델 | 공개 API | 6시간 | 458 |
| Hugging Face 주간 인기 논문 | 지난주 추천수 상위 AI 논문 30편 | 공개 API | 12시간 | 30 |
| HelloGitHub | 사람이 골라 소개하는 오픈소스 저장소 | 공개 API | 1일 | 20 |
| dev.to 주간 인기글 | 최근 7일 반응 상위 개발 글 30개 | 공개 API | 6시간 | 30 |
| GitHub Trending | 오늘 스타가 많이 늘어난 저장소 | HTML 파싱 | 6시간 | 9 |
| Trendshift | 떠오르는 GitHub 저장소 순위 | HTML 안의 구조화 데이터 | 6시간 | 25 |
| Indie Hackers 주간 인기글 | 지난주 인기 1인 창업·사이드 프로젝트 글 | HTML 파싱 | 12시간 | 20 |
| Anthropic News | Anthropic 공지·연구 | HTML 파싱 | 6시간 | 10 |

## Feed별 설명

### 개발·기술 뉴스

**Hacker News Best** (`hn-best`)
- 출처: [news.ycombinator.com/best](https://news.ycombinator.com/best)
- 가져오기: 공식 API(`hacker-news.firebaseio.com/v0/beststories.json`)로 상위 30개를 가져온다.
- 새 Entry: 상위 30위 안에 처음 들어온 글. 30위 밖에서 올라왔다 사라진 글은 놓친다.
- 화면: 점수(▲)와 댓글 수를 보여 준다. 댓글 수를 누르면 HN 토론 페이지로 간다.

**Show HN** (`hn-show`)
- 출처: [news.ycombinator.com/show](https://news.ycombinator.com/show)
- 나머지는 Hacker News Best와 같다(API 목록 `showstories.json`).

**GeekNews** (`geeknews`)
- 출처: [news.hada.io](https://news.hada.io)
- 가져오기: 공식 RSS `https://news.hada.io/rss/news`. 최근 50건이 온다.
- 새 Entry: GeekNews에 새로 올라온 글. 요약에 원문 요약 문단이 들어간다.

**TechCrunch** (`techcrunch`)
- 출처: [techcrunch.com](https://techcrunch.com)
- 가져오기: 공식 RSS `https://techcrunch.com/feed/`. 최근 20건이 온다.
- 새 Entry: 새 기사.

**dev.to 주간 인기글** (`devto-top-week`)
- 출처: [dev.to/top/week](https://dev.to/top/week)
- 가져오기: 공개 API `https://dev.to/api/articles?top=7&per_page=30`
- 새 Entry: 최근 7일 반응 상위 30개에 처음 든 글. 주기마다 순위가 바뀌므로 한 주 동안 조금씩 들어온다.
- 화면: 반응 수(▲)와 댓글 수를 보여 준다.

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
- 참고: 추천수(vote)는 피드에 없다. 요약 끝에 "Discussion | Link"가 붙는다.

**GitHub Trending** (`github-trending-daily`)
- 출처: [github.com/trending](https://github.com/trending?since=daily)
- 가져오기: `?since=daily` 페이지의 HTML을 파싱한다. 로그인하지 않은 요청이라 9개 정도만 온다.
- 새 Entry: 오늘 순위에 처음 오른 저장소. 며칠 연속으로 순위에 있어도 Entry는 하나다.
- 화면: 오늘 늘어난 스타 수를 ▲로 보여 준다. 전체 스타 수와 언어는 저장만 하고 아직 화면에 보이지 않는다.

**Trendshift** (`trendshift`)
- 출처: [trendshift.io](https://trendshift.io)
- 가져오기: 첫 화면 HTML에 들어 있는 schema.org `ItemList`(JSON-LD)를 읽는다. 25개가 온다.
- 새 Entry: 순위에 처음 오른 저장소. GitHub Trending과 많이 겹친다.
- 참고: 링크는 GitHub 저장소로 가고, Trendshift 페이지 주소와 순위·키워드는 `extra`에 저장한다.

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
- 참고: RSS에 2015년부터의 글 전체(1230건)가 들어 있어서 첫 수집 때 모두 안 읽음으로 뜬다.

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
- 참고: 첫 수집 때 기존 모델 전체(458개)가 들어온다. 컨텍스트 길이와 토큰 가격은 `extra`에 저장한다.

**Hugging Face 주간 인기 논문** (`hf-papers-weekly`)
- 출처: [huggingface.co/papers](https://huggingface.co/papers)
- 가져오기: 공개 API `https://huggingface.co/api/daily_papers?week=<지난주>&limit=30`. 지난 ISO 주(UTC)의 추천수 상위 30편이다.
- 새 Entry: 주가 바뀐 뒤 첫 수집 때 30편이 한꺼번에 들어온다. 그 주 동안은 0건이다.
- 화면: 추천수(▲)와 댓글 수를 보여 준다. 링크는 HF 논문 페이지로 가고, arXiv 주소는 `extra.arxivUrl`에 저장한다.
