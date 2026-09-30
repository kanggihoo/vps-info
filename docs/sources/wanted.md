# 원티드 데이터 가져오기

원티드([wanted.co.kr](https://www.wanted.co.kr))에서 공고를 어떻게 가져오고, 응답의 숫자가 무엇을 뜻하는지 정리한 문서다.
Feed 목록은 [등록된 Feed](../feeds.md), Handler 작성 절차는 [새 Feed 추가하기](../guides/adding-a-feed.md)를 본다.

**공식 API가 아니다.** 아래 주소는 원티드 웹이 자기 화면에서 쓰는 것이라, 예고 없이 바뀔 수 있다. 확인 시점은 **2026-09-30**이고, 값이 어긋나면 6장 방법으로 다시 확인한다.

## 1. 데이터가 오는 길

| 용도 | 주소 | 로그인 | 쓰는 곳 |
|---|---|---|---|
| 목록 | `GET /api/chaos/navigation/v1/results` | 필요 없음 | 수집기 `wanted-handler.ts` |
| 상세 | `GET /wd/<공고 id>` 페이지 HTML 안의 `__NEXT_DATA__` | 필요 없음 | 읽기 버튼 `server/wanted-job-page.ts` (ADR-0013) |
| 상세(같은 데이터) | `GET /_next/data/<buildId>/wd/<공고 id>.json` | 필요 없음 | 쓰지 않음. `buildId`가 배포마다 바뀐다 |
| 옛 목록·상세 | `GET /api/v4/jobs`, `/api/v4/jobs/<id>`, `/api/chaos/jobs/v4/<id>/details` | 필요 없음 | 쓰지 않음. 웹이 쓰는 경로가 아니다 |

- 웹 화면에서 필터를 걸려면 로그인하라고 하지만, 위 주소는 로그인 없이 응답한다. 서버가 막지 않았을 뿐 의도된 공개인지는 알 수 없다.
  **로그인 후에만 붙는 파라미터(`employment_types`, `attraction_tags` 등)는 쓰지 않는다.** 고용 형태는 응답의 `employment_type`으로 직접 거른다.
- 상세 페이지는 Next.js가 서버에서 그려 보내며 공고 내용을 HTML에 함께 싣는다(`props.pageProps.initialData`).
  그래서 주소창으로 직접 진입하면 Network 탭에 API 요청이 안 보이고, 목록에서 링크를 눌러 이동하면 `_next/data/…json` 요청이 찍힌다.

## 2. 목록 API

```
GET https://www.wanted.co.kr/api/chaos/navigation/v1/results
  ?job_group_id=518
  &job_ids=872&job_ids=10110      # 직무 ID를 반복해서 붙인다
  &country=kr
  &years=0
  &locations=all
  &job_sort=job.latest_order
  &limit=100
  &offset=0
```

### 파라미터

| 파라미터 | 값 | 뜻 |
|---|---|---|
| `job_group_id` | `518` | 직군(대분류). 3장 표 |
| `job_ids` | 직무 ID | 직무(소분류). 4장 표. **같은 이름을 반복**해서 여러 개를 보낸다. 쉼표(`872,10110`)는 오류다 |
| `country` | `kr` / `all` | 국가. `kr`은 한국 공고만 |
| `years` | `-1` / `0` / 숫자 | 경력. `-1`은 경력 제한 없이 전체, `0`은 신입이 지원할 수 있는 공고(응답의 `is_newbie`가 true) |
| `locations` | `all` | 지역. 다른 값은 확인하지 않았다 |
| `job_sort` | `job.latest_order` / `job.popularity_order` | 최신 등록순 / 인기순. 수집은 최신순만 쓴다 |
| `limit` | 숫자 | 한 번에 받을 수. 100까지 확인했다 |
| `offset` | 숫자 | 건너뛸 수. 다음 페이지는 응답의 `links.next`가 알려 준다(없으면 끝) |

- `job_ids`를 빼면 그 직군 전체가 온다.
- `years=0`으로 받은 공고도 경력 범위가 `신입~10년`, `경력 무관`(0~100)인 경우가 많다. 신입 전용이 아니라 "신입이 지원 가능"이다.
- 결과 수는 조건에 따라 다르다. 2026-09-30에 `years=0`으로 직무 하나씩 받은 수는 서버 59, 소프트웨어 엔지니어 74, 머신러닝 119, 프론트엔드 49 등이다.

### 응답 필드와 Entry 대응

응답은 `{ data: [공고…], links: { prev, next } }`이다. 공고 하나에서 쓰는 필드와 저장 위치는 다음과 같다.

| 응답 필드 | 뜻 | Entry 필드 |
|---|---|---|
| `id` | 공고 id | `externalId`(Dedup Key), `url`의 `/wd/<id>` |
| `position` | 제목 | `title` |
| `company.name` | 회사명 | `author` |
| `address.location`, `address.district` | 시·도, 구·군 | `extra.location` (`서울 강남구`) |
| `annual_from`, `annual_to` | 요구 경력 하한·상한(년) | `extra.career` (5장 표) |
| `employment_type` | 고용 형태 | `extra.tags`에 `인턴`·`계약직`(정규직은 태그 없음) |
| `category_tag.id` | 공고의 세부 직무 ID | `extra.tags`에 직무 이름(4장 표) |
| `is_newbie` | 신입 지원 가능 | 쓰지 않음(`years=0`이면 모두 true) |
| `skill_tags` | 기술스택 **ID** 배열(이름 없음) | 쓰지 않음 |
| `reward_total`, `reward` | 합격 보상금 | 쓰지 않음(태그로 만들지 않기로 했다) |
| `is_outlink` | 기업 자체 사이트 지원 여부(주소 아님) | 쓰지 않음. 주소는 상세에만 있다 |
| 나머지 | 로고 이미지, 응답률 등 | `raw`에만 보존(ADR-0003) |

- **마감일은 chaos 목록에 없다**(`due_time` 키 자체가 없다). 상세 페이지 `initialData.due_time`(`2026-10-31T00:00:00`)과 JSON-LD `validThrough`에 있고, 옛 목록 `/api/v4/jobs`에도 있다.
  마감이 있는 공고는 일부다(2026-09-30, 서버 개발자 신입 55건 중 8건). 나머지는 `due_time`이 null인 상시 채용으로 보인다.
  그래서 수집 때는 마감을 모르고, **사용자가 상세를 열 때** 읽은 마감일을 `entry.extra.deadline`에 저장해 다음부터 목록 카드에 보여 준다(ADR-0013).
- `category_tag`는 공고가 가진 직무 중 **하나**만 준다. 여러 직무에 걸린 공고는 조회한 직무와 다른 이름이 붙을 수 있다.

## 3. 직군 ID (`job_group_id`)

웹의 "직군・직무" 선택 창에서 대분류 버튼의 `data-itemid`다.

| ID | 직군 | ID | 직군 |
|---|---|---|---|
| `-1` | 직군 전체 | `522` | 제조·생산 |
| **`518`** | **개발** (수집 대상) | `508` | 금융 |
| `507` | 경영·비즈니스 | `517` | HR |
| `523` | 마케팅·광고 | `10566` | 정보보호 |
| `511` | 디자인 | `509` | 건설·시설 |
| `510` | 고객서비스·리테일 | `959` | 게임 제작 |
| `530` | 영업 | `532` | 물류·무역 |
| `524` | 미디어 | `10057` | 식·음료 |
| `513` | 엔지니어링·설계 | `521` | 법률·법집행기관 |
| `10101` | 교육 | `515` | 의료·제약·바이오 |
| `514` | 공공·복지 | | |

## 4. 개발 직군(518)의 직무 ID (`job_ids`, `category_tag.id`)

소분류 버튼의 `data-itemid`다. **직무군**은 우리 Feed의 묶음이고 `feed-definitions.ts`의 `wantedRoleGroups`에 있다.
`신입 공고 수`는 `years=0`으로 직무 하나만 물었을 때의 건수(2026-09-30)다. 직무가 겹쳐서 합이 전체와 같지 않다.

| ID | 직무 | 직무군(Feed) | 신입 공고 수 |
|---|---|---|---|
| `872` | 서버 개발자 | 백엔드 `wanted-backend` | 59 |
| `10110` | 소프트웨어 엔지니어 | 백엔드 | 74 |
| `660` | 자바 개발자 | 백엔드 | 21 |
| `895` | Node.js 개발자 | 백엔드 | 29 |
| `899` | 파이썬 개발자 | 백엔드 | 52 |
| `10231` | DBA | 백엔드 | 3 |
| `873` | 웹 개발자 | 웹·프론트 `wanted-web` | 24 |
| `669` | 프론트엔드 개발자 | 웹·프론트 | 49 |
| `1634` | 머신러닝 엔지니어 | AI·데이터 `wanted-ai-data` | 119 |
| `655` | 데이터 엔지니어 | AI·데이터 | 41 |
| `1025` | 빅데이터 엔지니어 | AI·데이터 | 19 |
| `1024` | 데이터 사이언티스트 | AI·데이터 | 30 |
| `674` | DevOps / 시스템 관리자 | 인프라·운영 `wanted-infra` | 32 |
| `665` | 시스템,네트워크 관리자 | 인프라·운영 | 18 |
| `676` | QA,테스트 엔지니어 | QA·매니지먼트 `wanted-qa-manager` | 17 |
| `877` | 개발 매니저 | QA·매니지먼트 | 11 |
| `677` | 안드로이드 개발자 | 앱 `wanted-app` | 8 |
| `678` | iOS 개발자 | 앱 | 8 |
| `10111` | 크로스플랫폼 앱 개발자 | 앱 | 3 |

**수집하지 않는 직무** (Feed에 넣지 않았다):

| ID | 직무 | 이유 |
|---|---|---|
| `661` | .NET 개발자 | 제외하기로 함 |
| `893` `1022` | PHP 개발자, BI 엔지니어 | 신입 공고가 0건 |
| `900` `658` `672` | C,C++ 개발자, 임베디드 개발자, 하드웨어 엔지니어 | 서버·웹 목표와 결이 다름 |
| `876` `1026` `10536` `939` | 프로덕트 매니저, 기술지원, 테크니컬 라이터, 웹 퍼블리셔 | 개발 직무와 성격이 다름 |
| `795` `793` | CTO, CIO | 고위직 |
| `1027` `898` `10112` `896` `10230` `10531` `894` | 블록체인, 그래픽스, VR, 영상·음성, ERP, RPA, 루비온레일즈 | 특수 분야 |

`wanted-handler.ts`의 `JOB_NAMES`는 **수집하는 직무만** 이름을 안다. 모르는 ID의 공고는 직무 태그 없이 나온다.

## 5. 값 해석

### `employment_type`

| 값 | 표기 |
|---|---|
| `regular` | 정규직 (태그 없음) |
| `intern` | 인턴 |
| `contract` | 계약직 |

### 경력 표기 (`annual_from`, `annual_to` → `extra.career`)

`job-posting.ts`의 `makeCareerLabel`이 만든다. 상한이 50 이상이면 "상한 없음"으로 본다(원티드가 "무관"을 100으로 준다).

| 하한 | 상한 | 표기 |
|---|---|---|
| 0 | 0 | 신입 |
| 0 | 1~49 | 신입~N년 |
| 0 | 50 이상 | 경력 무관 |
| N(1 이상) | N | N년 |
| N | M(N보다 큼, 50 미만) | N~M년 |
| N | 50 이상 | N년 이상 |

## 6. 상세 페이지 데이터

`https://www.wanted.co.kr/wd/<id>`를 받아 `<script id="__NEXT_DATA__">`의 JSON에서 `props.pageProps.initialData`를 읽는다(`server/wanted-job-page.ts`).

| 필드 | 뜻 | 화면 |
|---|---|---|
| `position` | 제목 | 제목 |
| `company.company_name` | 회사명(목록과 달리 `name`이 아니다) | 작성자 |
| `employment_type`, `is_remote_work` | 고용 형태, 원격 근무 | 맨 위 한 줄 |
| `out_link` | 기업 자체 채용 사이트 지원 주소. 원티드로 지원하는 공고는 비어 있다 | "기업 채용 사이트에서 지원" 링크(http(s)만) |
| `requirements` | 자격 요건 | 1번째 섹션 |
| `main_tasks` | 주요 업무 | 2번째 |
| `preferred_points` | 우대 사항 | 3번째 |
| `hire_rounds` | 채용 전형 | 4번째 |
| `benefits` | 혜택 및 복지 | 5번째 |
| `intro` | 회사 소개 | 6번째 |
| `due_time` | 마감일(`2026-10-31T00:00:00`). 마감이 없는 공고는 null | 날짜만 뽑아 `마감 2026-10-31`로 맨 위에 표시하고 `entry.extra.deadline`에 저장 |
| `reward` | 합격 보상금 | 쓰지 않음 |

- 글 내용은 `ㆍ`로 시작하는 줄이 이어진 평문이다. `ㆍ` 줄은 Markdown 목록으로, 나머지 줄은 줄바꿈을 지킨 문단으로 바꾼다.
- 줄 앞의 `#`, `>`, `1.`은 Markdown 문법으로 읽히지 않게 막는다.
- 기술스택 필드(`skill_tags`)는 이 데이터에 없다. 자격 요건 글에 적힌 것을 읽는다.

## 7. 다시 확인하는 방법

**크롬 개발자 도구**
1. Network 탭에서 **Fetch/XHR**를 켜고 새로고침한다(로드 후에 열면 이미 지나간 요청은 안 보인다).
2. 필터에 `chaos`를 넣으면 목록 요청이 나온다. 요청을 눌러 **Payload → Query String Parameters**의 key/value를 본다.
3. 화면에서 조건을 **하나만** 바꾸고 다시 보면 그 조건이 어느 파라미터인지 알 수 있다.
4. 상세는 목록에서 공고를 눌러 이동할 때 `_next/data/…/wd/<id>.json`이 찍힌다. 주소로 직접 진입하면 문서(HTML) 요청 하나뿐이다.
5. 요청 우클릭 → Copy → Copy as cURL로 옮길 때 쿠키와 토큰 헤더는 지운다.

**터미널**
```bash
# 목록: 서버 개발자 신입 3건
curl -s -A "trendboda/1.0" "https://www.wanted.co.kr/api/chaos/navigation/v1/results?job_group_id=518&job_ids=872&country=kr&years=0&locations=all&job_sort=job.latest_order&limit=3"

# 직무 ID와 이름(옛 주소지만 개발 직군 전체 목록이 나온다)
curl -s -A "trendboda/1.0" "https://www.wanted.co.kr/api/v4/tags?parent_id=518"
```

## 8. 한국 IP 프록시 (운영, ADR-0014)

원티드의 CloudFront는 VPS(자카르타 Hostinger)의 IP를 403으로 막는다. 헤더나 경로를 바꿔도 같고, 한국 IP에서는 200이다(2026-09-30 확인).
그래서 원티드 요청(`www.wanted.co.kr`)만 집 맥의 한국 IP로 나간다. 수집 Handler와 원문 읽기 둘 다 같은 경로를 쓴다.

```
collector·app 컨테이너 ──▶ 맥의 프록시(Tailscale 주소:18888) ──▶ wanted.co.kr
```

- 코드: `apps/backend/src/wanted-proxy.ts`. `WANTED_PROXY_URL`이 있으면 undici `ProxyAgent`를 만들고, 호스트가 정확히 `www.wanted.co.kr`인 요청에만 붙인다.
- 설정: `compose.yml`의 기본값은 `http://100.66.95.61:18888`(맥의 Tailscale 주소), `compose.local.yml`은 빈 값(직접 호출)이다. 비우면 프록시 없이 나간다.
- 프록시: `scripts/wanted-proxy/connect-proxy.py`. Tailscale 주소에서만 받고 `www.wanted.co.kr:443`만 중계한다. 맥에서 `scripts/wanted-proxy/install-launchd.sh`를 한 번 실행하면 프록시와 깨우기 작업이 로그인할 때 자동으로 켜진다. **배포가 끝난 뒤에 실행한다**(먼저 하면 프록시 코드가 없는 이전 collector가 원티드를 직접 불러 실패한다).
- **맥이 켜져 있을 때만 수집한다.** 원티드 Feed의 주기는 DB에서 525600분(1년)이라 VPS는 스스로 시도하지 않는다.
  대신 맥의 `launchd` 작업(`com.kkh.wanted-wake`, `install-launchd.sh`가 등록)이 로그인할 때와 켜져 있는 동안 3시간마다 VPS의 `feed.next_run_at`을 지금으로 바꿔서 collector가 곧바로 수집하게 한다.
  맥이 꺼져 있는 동안은 시도도 실패도 없다. 꺼져 있던 사이에 올라온 공고는 다음 수집 때 한꺼번에 들어온다(최신순 100개씩 최대 10페이지).
- 맥이 켜졌는데 프록시나 Tailscale이 죽어서 실패하면 재시도 간격이 5분, 15분, 45분…으로 늘어난다. 다음에 맥이 깨우면 다시 시도한다.
- 프록시 기기를 항상 켜진 것으로 바꾸려면(예: 라즈베리파이) 그 기기에서 같은 프록시를 돌리고 `WANTED_PROXY_URL`의 주소를 바꾼 뒤, 깨우기 작업을 지우고 원티드 주기를 DB에서 다시 720으로 돌린다.

## 9. 알려진 한계

- 공식 API가 아니어서 주소, 파라미터, 응답 필드가 바뀔 수 있다. 바뀌면 Handler가 0건이나 `empty`로 실패하고 화면에 경고가 뜬다.
- 수집 목록에는 마감일이 없어서 **열어 본 공고만** 카드에 마감이 보인다(상세에는 있다). 기술스택 이름도 가져오지 못한다.
- `category_tag`가 하나뿐이라 태그의 직무가 Feed의 직무군과 다를 수 있다.
- `robots.txt`(`/robots.txt`)는 403이라 규칙을 확인하지 못했다.
