---
version: alpha
name: Trendboda
description: 여러 Feed의 새 Entry를 매일 훑어보는 개인용 읽기 도구. Mintlify의 무채색 바탕과 민트 강조색을 가져오되 마케팅 요소는 버리고, 사이드바 + 채팅형 타임라인 2열 구조에 맞춰 촘촘하게 다듬었다. UI는 Geist(한글 Pretendard), 숫자는 Geist Mono. 기본은 라이트 모드이고 토글로 다크 모드를 켠다.

fonts:
  sans: '"Geist Variable", "Pretendard Variable", system-ui, sans-serif'
  mono: '"Geist Mono Variable", ui-monospace, monospace'

colors:
  background: "#ffffff"
  foreground: "#0a0a0a"
  card: "#ffffff"
  card-foreground: "#0a0a0a"
  popover: "#ffffff"
  popover-foreground: "#0a0a0a"
  primary: "#0a0a0a"
  primary-foreground: "#ffffff"
  secondary: "#f7f7f7"
  secondary-foreground: "#0a0a0a"
  muted: "#f7f7f7"
  muted-foreground: "#5a5a5c"
  subtle-foreground: "#888888"
  accent: "#f7f7f7"
  accent-foreground: "#0a0a0a"
  destructive: "#b03a3a"
  border: "#e5e5e5"
  input: "#e5e5e5"
  ring: "#007a5e"
  brand: "#00d4a4"
  brand-foreground: "#0a0a0a"
  brand-ink: "#007a5e"
  warn: "#c37d0d"
  warn-ink: "#95600a"
  sidebar: "#ffffff"
  sidebar-foreground: "#5a5a5c"
  sidebar-primary: "#0a0a0a"
  sidebar-primary-foreground: "#ffffff"
  sidebar-accent: "#ededed"
  sidebar-accent-foreground: "#0a0a0a"
  sidebar-border: "#e5e5e5"
  sidebar-ring: "#007a5e"

colors-dark:
  background: "#0a0a0a"
  foreground: "#fafafa"
  card: "#111112"
  card-foreground: "#fafafa"
  popover: "#111112"
  popover-foreground: "#fafafa"
  primary: "#fafafa"
  primary-foreground: "#0a0a0a"
  secondary: "#1c1c1e"
  secondary-foreground: "#fafafa"
  muted: "#1c1c1e"
  muted-foreground: "#a8a8aa"
  subtle-foreground: "#888888"
  accent: "#1c1c1e"
  accent-foreground: "#fafafa"
  destructive: "#e06b6b"
  border: "#2a2a2c"
  input: "#2a2a2c"
  ring: "#00d4a4"
  brand: "#00d4a4"
  brand-foreground: "#0a0a0a"
  brand-ink: "#00d4a4"
  warn: "#c37d0d"
  warn-ink: "#c37d0d"
  sidebar: "#0a0a0a"
  sidebar-foreground: "#a8a8aa"
  sidebar-primary: "#fafafa"
  sidebar-primary-foreground: "#0a0a0a"
  sidebar-accent: "#27272a"
  sidebar-accent-foreground: "#fafafa"
  sidebar-border: "#2a2a2c"
  sidebar-ring: "#00d4a4"

typography:
  app-title:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: -0.2px
  entry-title:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: -0.1px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
  body-sm-medium:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.50
  caption:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.40
  caption-bold:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.40
  micro-uppercase:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: 0.5px
  button-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.30
  numeric-sm:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.40
  numeric-badge:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.30

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 40px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  bookmark-toggle:
    backgroundColor: "{colors.card}"
    textColor: "{colors.subtle-foreground}"
    rounded: "{rounded.full}"
    size: 32px
  bookmark-toggle-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.brand-ink}"
  feed-nav-item:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  feed-nav-item-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
    typography: "{typography.body-sm-medium}"
  sidebar-section-header:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.micro-uppercase}"
  badge-unread:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-foreground}"
    typography: "{typography.numeric-badge}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-failure:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.warn-ink}"
    typography: "{typography.numeric-badge}"
  entry-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.entry-title}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  entry-card-opened:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body-sm-medium}"
  entry-meta:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.caption}"
  unread-divider:
    backgroundColor: "{colors.background}"
    textColor: "{colors.brand-ink}"
    typography: "{typography.caption-bold}"
  jump-to-latest:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "10px 16px"
  skeleton-block:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.xs}"
  inline-error:
    backgroundColor: "{colors.background}"
    textColor: "{colors.destructive}"
    typography: "{typography.caption}"
  tooltip:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
---

# Design System: Trendboda

화면(`apps/web`)을 만들거나 고칠 때 따르는 디자인 기준이다. Google Stitch로 새 화면을 생성할 때도 이 문서를 그대로 넣는다.

## Overview

조용하고 밀도 있는 읽기 도구. 장식보다 **훑는 속도**와 **안 읽음 위치를 잃지 않는 것**이 우선이다.
하얀 캔버스와 무채색 회색 단계 위에서 민트 하나만 신호처럼 켜진다 — 안 읽음 수, "여기부터 새 글", 켜진 Bookmark. 마케팅 페이지가 아니므로 Hero, CTA, 일러스트 장식은 없다.

- **Density 6 — Daily App Balanced.** 한 화면에 Entry 8–12개가 보인다.
- **Variance 2 — Predictable Symmetric.** 사이드바 + 가운데 읽기 칼럼의 고정 구조.
- **Motion 3 — Static Restrained.** 움직임은 상태 변화를 알릴 때만 쓴다.

### 이 문서와 코드의 관계

- 위 YAML 토큰이 값의 단일 출처다. `npm run design:tokens`가 이 YAML을 읽어 `src/styles/design-tokens.css`와 `src/styles/design-token-names.ts`를 만든다. 그 파일은 손으로 고치지 않는다.
- 색 토큰 이름은 shadcn/ui의 CSS 변수 이름을 그대로 쓴다. 그래서 shadcn 컴포넌트가 고치지 않고도 이 팔레트로 그려진다. `colors.brand` → `--brand` → Tailwind `bg-brand`.
- `colors-dark`는 `.dark` 클래스(토글)에서 같은 변수에 덮어쓰는 값이다. 키는 `colors`와 1:1로 같아야 한다.
- `fonts`는 Tailwind `font-sans`, `font-mono`가 된다. `typography`의 각 항목은 `text-<이름>` 한 클래스로 크기·굵기·줄 간격·자간을 함께 준다(`text-entry-title`).
- `spacing`은 Tailwind 기본 4px 단위와 같아서 따로 생성하지 않는다: `xxs`=`1`, `xs`=`2`, `sm`=`3`, `md`=`4`, `lg`=`5`, `xl`=`6`, `xxl`=`8`, `xxxl`=`10`(`p-4` = 16px).
- `npm run design:lint`가 깨진 참조와 대비를 검사한다(`@google/design.md`).
- 기반: [Mintlify DESIGN.md](https://getdesign.md/mintlify/design-md)의 색·모서리·간격·버튼 체계. 마케팅 요소(hero 그라디언트, testimonial 오렌지, pricing, logo wall)와 Inter는 가져오지 않았다. Mintlify는 다크 팔레트를 공개하지 않아 `colors-dark`는 이 프로젝트에서 정했다.

## Colors

무채색 한 계열과 민트 하나로 만든다. 괄호 안은 Mintlify 원본 이름이다.

- **Background / Card** (`canvas` #ffffff · 다크 #0a0a0a / #111112) — 페이지 배경, Entry 카드 바탕
- **Muted / Secondary / Accent** (`surface` #f7f7f7 · 다크 #1c1c1e) — hover 바탕, 스켈레톤, 보조 버튼 바탕. shadcn에서 `accent`는 **hover 바탕**이지 브랜드색이 아니다
- **Sidebar Accent** (`hairline-soft` #ededed · 다크 #27272a) — 선택된 Feed 행
- **Border / Input** (`hairline` #e5e5e5 · 다크 #2a2a2c) — 카드 테두리, 사이드바 경계선
- **Foreground** (`ink` #0a0a0a · 다크 #fafafa) — Entry 제목, 선택된 Feed 이름
- **Muted Foreground** (`steel` #5a5a5c · 다크 #a8a8aa) — 메타데이터, 요약, 연 Entry 제목, 선택 안 된 Feed 이름
- **Subtle Foreground** (`stone` #888888) — 꺼진 아이콘 전용. 글자에는 쓰지 않는다(흰 바탕 대비 3.5:1)
- **Brand** (`brand-green` #00d4a4) — 유일한 강조색. **면과 선으로만** 쓴다: 안 읽음 배지 바탕, 새 글 구분선. 그 위의 글자는 `brand-foreground`(검정)
- **Brand Ink** (#007a5e · 다크 #00d4a4) — 민트를 **글자·아이콘·포커스 링**에 쓸 때. 흰 바탕 대비 5.3:1. `ring`도 이 값이다
- **Warn** (`brand-warn` #c37d0d, 글자는 `warn-ink` #95600a) — 연속 실패 경고. 강조색이 아니라 상태색
- **Destructive** (`brand-error`를 대비에 맞춰 어둡게 한 #b03a3a · 다크 #e06b6b) — 요청 실패 안내

### 규칙

- 라이트 모드에서 `brand`를 글자색으로 쓰지 않는다(흰 바탕 대비 1.9:1). 대신 `brand-ink`. 민트 위에 흰 글자를 올리지 않는다.
- 선택 상태는 민트가 아니라 `sidebar-accent` 바탕 + `foreground` 글자로 표시한다. 민트는 "새것이 있다"는 신호 전용이다.
- Bookmark에 노랑, 배지에 빨강 같은 두 번째 강조색을 쓰지 않는다.
- Tailwind 기본 팔레트(`bg-zinc-100`, `text-emerald-600`)와 임의 값(`bg-[#123456]`)을 쓰지 않는다. 새 색이 필요하면 YAML에 이름을 붙여 추가하고 `npm run design:tokens`를 돌린다.
- 모든 글자는 WCAG AA(4.5:1), 아이콘과 포커스 링은 3:1 이상.
- `brand`의 채도는 100%로 stitch-design-taste의 채도 80% 미만 규칙을 넘는다. 넓은 면에 쓰지 않는 조건으로 Mintlify 값을 그대로 쓴다.

## Typography

- **UI:** `font-sans` — Geist에 한글이 없어 Pretendard가 받는다.
- **숫자:** `font-mono tabular-nums` — 날짜·시각, 안 읽음 수, 점수, 댓글 수, 연속 실패 횟수.
- 폰트 파일은 npm 패키지(`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `pretendard`의 dynamic subset)로 받아 앱이 직접 서빙한다. 외부 CDN을 쓰지 않는다.
- **단계** (`text-<이름>`):
  - `app-title` 18/600 — 사이드바 앱 이름
  - `entry-title` 16/600 — Entry 제목. 연 Entry는 `body-sm-medium` + `muted-foreground`
  - `body-sm` 14/400/1.5 — Feed 이름, Entry 요약
  - `caption` 13 — 메타데이터, `caption-bold`는 구분선 라벨
  - `micro-uppercase` 11/600 — 사이드바 구역 머리글(Stream, Ranked)
  - `button-md` 14/500 — 버튼 라벨
  - `numeric-sm` 13, `numeric-badge` 12/600 — 숫자(`font-mono`와 함께)
- 위계는 크기보다 **굵기와 색**으로 만든다. 요약 줄 간격은 1.5 아래로 내리지 않는다.
- 읽기 칼럼 최대 폭 760px, 요약은 2줄에서 자른다(`line-clamp-2`).
- **Banned:** `Inter`, 세리프, 이탤릭, 토큰에 없는 글자 크기(`text-[15px]`).

## Layout

- **데스크톱**: CSS Grid 2열 — 사이드바 240px(`sidebar` 바탕, 오른쪽 1px `sidebar-border`) + 본문 `1fr`(`background`). 높이 `h-dvh`.
- **본문**: 스크롤은 본문 영역 안에서만. 읽기 칼럼 `max-w-[760px] mx-auto px-4`.
- **간격**: Tailwind 4px 단위만 쓴다. 사이드바 행 사이 4px(`gap-1`), 카드 사이 8px(`gap-2`), 영역 여백 16px(`p-4`).
- 요소를 겹쳐 쌓지 않는다. 예외는 떠 있는 "안 읽음" 버튼 하나이며, 칼럼 바깥 오른쪽 아래(24px)에 둔다.
- **768px 미만**(`md:` 아래): 1열. 사이드바는 위쪽 가로 탭 줄이 되고 그 줄 **안에서만** 가로 스크롤을 허용한다. 페이지 자체의 가로 스크롤은 실패다. 모바일 탭 대상은 최소 44px, 떠 있는 버튼은 오른쪽 아래 16px.

## Elevation & Depth

- 기본은 평평하게, 1px `border`로 구분한다. 카드에 그림자를 주지 않는다.
- 그림자는 떠 있는 "안 읽음" 버튼 하나: `0 4px 12px rgb(10 10 10 / 0.08)`(`shadow-md` 정도). 발광·그라디언트 금지.

## Shapes

- `rounded-xs` 4px(스켈레톤) / `rounded-sm` 6px(Feed 행) / `rounded-md` 8px(ghost 버튼, 툴팁) / `rounded-lg` 12px(카드) / `rounded-full`(버튼·배지).
- 같은 종류의 요소에 다른 모서리를 섞지 않는다.

## Components

- **사이드바 구역** (`sidebar-section`): Stream 구역을 위에, Ranked 구역을 아래에 둔다. 머리글은 `text-micro-uppercase` + `muted-foreground`이며 데스크톱에서만 보인다(모바일 가로 탭 줄에서는 스크린 리더용).
- **Feed 행** (`feed-nav-item`): `rounded-sm`, `px-3 py-2`, 한 줄 말줄임. 선택되면 `sidebar-accent` 바탕 + `text-body-sm-medium`. 오른쪽 끝에 배지.
- **Group 행** (`feed-nav-group`): Feed Group 한 줄(ADR-0010). Feed 행과 같은 모양이고, 묶인 Feed 중 하나라도 안 읽음·NEW가 있으면 오른쪽 끝에 8px 민트 점(`bg-brand`)만 찍는다. 숫자는 가운데 탭에서 보인다.
  묶인 Feed가 실패 중이면 가장 큰 연속 실패 수를 경고로 보이고, 툴팁에 실패한 Feed를 한 줄씩 적는다.
- **Feed Group 탭 줄** (`feed-group-bar`): Group에 든 Feed를 볼 때 본문 위에 붙는 줄. 아래쪽 1px `border`, 안쪽은 읽기 칼럼 폭.
  첫 번째 축(기간, 구역)은 알약 탭(`rounded-full px-3 py-1.5`)이고 선택은 `sidebar-accent` 바탕이다. 탭 글자 옆에 그 Feed의 안 읽음·NEW 배지.
  나머지 축(언어)은 오른쪽 끝의 알약 모양 기본 `<select>`(1px `input` 테두리)이고, 선택지 글자에 ` · NEW 3`을 붙인다. 모바일에서는 탭과 드롭다운이 줄을 바꿔 44px 높이가 된다.
- **안 읽음 배지** (`badge-unread`): 민트 알약 + 검정 Mono 숫자. 0이면 그리지 않는다.
- **NEW 수 배지** (`badge-rank-new`): Ranked Feed 행에 쓴다. 속이 빈 알약(1px `brand` 테두리) + `brand-ink` Mono 글자 `NEW 3`. 안 읽음 배지와 달리 열어 봐도 줄지 않으므로 채운 알약과 구분한다. 0이면 그리지 않는다.
- **연속 실패** (`badge-failure`): 바탕 없이 경고 아이콘(`text-warn`) + Mono 숫자(`text-warn-ink`). 툴팁으로 다음 시도 시각을 보여 준다.
- **Entry 카드** (`entry-card`): `bg-card`, 1px `border`, `rounded-lg`, `px-4 py-3`, 그림자 없음. 카드 사이 8px. Mintlify 카드 여백(24px)은 밀도 때문에 줄였다.
- **Entry 메타** (`entry-meta`): 호스트 · 작성자 · 시각 · 점수 · 댓글을 `text-caption`으로, 사이 간격 12px(`gap-x-3`). 숫자는 `font-mono`.
- **순위표** (`rank-table`): Ranked Feed 화면. 맨 위에 수집 시각과 비교한 직전 수집 시각을 `text-caption`으로, 그 아래에 순위순 Entry 카드. 카드 왼쪽에 순위 칸(모바일 32px, 데스크톱 48px)을 둔다.
  - 순위 숫자는 `text-entry-title` Mono. 그 아래에 변동 표시 하나.
  - NEW는 민트 알약(`bg-brand` + 검정 글자), 재진입은 1px `border` 알약 + `muted-foreground` 글자.
  - 오름·내림은 Lucide `ChevronUp` / `ChevronDown` + 계단 수를 `muted-foreground` Mono로. 오름을 민트로, 내림을 빨강으로 칠하지 않는다(두 번째 강조색 금지). 그대로면 `Minus`를 `subtle-foreground`로.
  - 점수 옆 괄호에 직전 수집 대비 증감(`(+240)`). 0이면 쓰지 않는다.
  - 빠진 Entry는 목록 아래 `<details>`에 접어 둔다. 요약 줄은 `빠짐 N개`(`text-caption-bold`), 순위 칸에는 `직전 N위`.
  - 빈 상태: "아직 순위표가 없습니다. 다음 수집은 14:30입니다."
- **Bookmark 토글** (`bookmark-toggle`): 32px 원형 탭 영역(모바일 44px). 꺼짐은 `subtle-foreground` 외곽선 별, 켜짐은 `brand-ink` 채운 별.
- **새 글 구분선** (`unread-divider`): 가운데 `text-caption-bold` 라벨(`brand-ink`), 양쪽으로 1px `brand` 선. 화면에 하나.
- **안 읽음으로 이동** (`jump-to-latest`): 검정 알약(다크 모드에서는 흰 알약). 화면에서 유일하게 그림자를 갖는다. 누르면 `translate-y-px`.
- **버튼**: shadcn `Button`을 쓴다. 기본은 알약(`rounded-full`), 사이드바 안의 ghost 버튼만 `rounded-md`. 주 버튼 검정, 보조 버튼은 1px `border`만.
- **다크 모드 토글**: 사이드바 아래쪽 ghost 아이콘 버튼(Lucide `Sun` / `Moon`). 기본은 라이트, 선택은 `localStorage`에 남긴다. OS 설정(`prefers-color-scheme`)은 따르지 않는다.
- **포커스**: 모든 상호작용 요소에 `focus-visible:ring-2 ring-ring ring-offset-2`. 없애지 않는다.
- **아이콘**: `lucide-react`만 쓴다. 선 굵기 1.5(`strokeWidth={1.5}`), 메타 14px, 버튼 18px. 유니코드 기호(★ ☆ ⚠ ▲ ↓)와 이모지는 쓰지 않는다.
- **로딩** (`skeleton-block`): shadcn `Skeleton`으로 Entry 카드 모양 그대로(제목 1줄 + 메타 1줄 + 요약 2줄) 5개. 스피너 금지.
- **빈 상태**: 다음에 무슨 일이 일어나는지 알려 준다. 예: "아직 수집된 Entry가 없습니다. 다음 수집은 14:30입니다." / "Entry의 별을 누르면 여기에 모입니다."
- **오류** (`inline-error`): 실패한 영역 안에 한 줄(`text-destructive`) + 다시 시도 버튼(보조 버튼). 콘솔에만 남기지 않는다.
- **툴팁** (`tooltip`): shadcn `Tooltip`. 연속 실패의 다음 시도 시각 같은 보조 정보에만 쓴다.

### Motion

- 상태 전환(hover 바탕, 선택, Bookmark 켜짐)은 `transition-colors duration-150 ease-out`.
- 떠 있는 버튼이 나타나고 사라질 때만 `transform` + `opacity`, 200ms `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- `motion-reduce:transition-none`으로 `prefers-reduced-motion`을 따른다.

### Copy & Terminology

- 화면 문구는 한국어. 도메인 용어는 [CONTEXT.md](../../CONTEXT.md) 표기를 그대로 쓴다 — Feed, Entry, Bookmark, Read Cursor.
  - _Avoid_: 소스, 채널, 게시물, 기사, 즐겨찾기, 저장함
- 짧고 사실만. 광고 문구 금지.
- 날짜는 `Intl.DateTimeFormat('ko')`의 `9. 28. 14:30` 형식, `font-mono`.

## Do's and Don'ts

### Do

- 색·글자·모서리는 토큰 유틸리티(`bg-brand`, `text-entry-title`, `rounded-lg`)로만 쓴다.
- 민트는 안 읽음·새 글(순위표의 NEW 포함)·켜진 Bookmark에만 쓴다.
- 숫자는 `font-mono tabular-nums`.
- 로딩은 모양 그대로의 스켈레톤, 빈 상태는 다음에 일어날 일을 알려 주는 문장.

### Don't

- 이모지, 아이콘 대용 유니코드 기호
- `Inter`, 세리프, 이탤릭
- 순수 검정 #000000, Tailwind 기본 팔레트, 임의 색 값
- 두 번째 강조색, 흰 바탕 위의 `brand` 글자, 민트 위의 흰 글자, 선택 상태를 민트로 칠하기
- 떠 있는 버튼 외의 그림자, 발광 그림자, 그라디언트
- 스피너, "데이터 없음"으로 끝나는 빈 상태
- Entry 목록의 순차 등장(stagger) — 열자마자 새 글 구분선으로 스크롤하는 동작과 충돌한다
- 반복 장식 모션(pulse, float, typewriter), 커스텀 커서. 스켈레톤 shimmer만 예외
- `top` / `left` / `width` / `height` 애니메이션
- `100vh` / `h-screen`, 페이지 가로 스크롤
- Hero, CTA, "스크롤해 보세요" 류 문구
- 가짜 이름·숫자 — 예시는 실제 Feed(`hn-best`, `trendshift-weekly`)를 쓴다
