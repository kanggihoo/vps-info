# ADR-0007: 화면 스타일은 DESIGN.md 토큰에서 생성한 CSS 변수와 Tailwind v4·shadcn/ui로 만든다

- 상태: 수용
- 결정일: 2026-09-28
- 관련: ADR-0001, ADR-0008(워크스페이스 분리. 아래 경로는 분리 뒤 위치로 적었다)

## 배경

첫 화면은 `web/src/styles.css` 한 파일(79줄)의 순수 CSS였다. 색만 `:root` 변수 9개로 묶여 있었고, 간격·글자 크기·모서리는
px 값이 코드 곳곳에 박혀 있었다. 버튼·배지 같은 공통 컴포넌트가 없어 파일마다 따로 만들었고, 아이콘은 유니코드 기호(★ ⚠ ▲ ↓)였다.
화면을 넓히기 전에 사람과 에이전트가 같은 기준으로 화면을 만들 수 있는 디자인 기준과 최소 모듈이 필요했다.

## 결정

1. **단일 출처**: 디자인 값은 `apps/web/DESIGN.md`의 YAML 머리말(Google `design.md` 형식)에만 둔다. 팔레트는 Mintlify DESIGN.md를 바탕으로 하고, 다크 값(`colors-dark`)은 직접 정한다.
2. **생성**: `npm run design:tokens`(`apps/web/scripts/generate-design-tokens.ts`)가 YAML로 `apps/web/src/styles/design-tokens.css`(`:root`·`.dark`·`@theme inline`)와 `design-token-names.ts`를 만든다. 생성 파일은 커밋하고, 테스트가 DESIGN.md와 어긋나지 않았는지 검사한다.
3. **이름**: 색 토큰 이름은 shadcn/ui CSS 변수 이름을 그대로 쓴다. 브랜드색은 shadcn의 `accent`(hover 바탕)와 섞이지 않게 `brand`·`brand-ink`로 따로 둔다.
4. **스타일링**: Tailwind CSS v4(`@tailwindcss/vite`)와 shadcn/ui(radix 기반, `apps/web/src/components/ui/`), 아이콘은 `lucide-react`.
5. **컴포넌트 추가**: shadcn 공식 CLI 대신 `npm run ui:add -- <이름>`(`apps/web/scripts/add-shadcn-component.ts`)으로 레지스트리 파일을 받아 `cn` import만 바꾼다.
6. **타입 설정 분리**: 화면 코드는 `apps/web/tsconfig.json`(bundler 해석, `@/` → `apps/web/src`)을 쓰고, 서버·수집기는 `apps/backend/tsconfig.json`(nodenext)을 쓴다.
7. **폰트**: Geist·Geist Mono·Pretendard(dynamic subset)를 npm 패키지로 받아 앱이 직접 서빙한다. 외부 CDN을 쓰지 않는다.
8. **다크 모드**: `<html class="dark">` 토글. 기본은 라이트이고 OS 설정은 따르지 않는다.

## 검토한 대안들

### 순수 CSS 변수와 직접 만든 컴포넌트

- 장점: 의존성이 없다. 지금 코드 양(약 660줄)에는 충분하다.
- 단점: 버튼·툴팁·접근성 처리를 직접 만들어야 하고, 에이전트가 따를 공통 어휘(유틸리티 이름, 컴포넌트 API)가 없다.
- 기각 사유: 화면을 늘릴 계획이라 shadcn/ui의 접근성 있는 컴포넌트와 Tailwind 어휘를 얻는 편이 낫다.

### `@google/design.md export --format css-tailwind`

- 장점: 공식 도구로 `@theme` 블록을 바로 만든다.
- 단점: 스펙에 없는 `colors-dark`를 무시해 라이트 값만 나오고, 폰트 대체 목록이 빠지며, 값을 `@theme`에 직접 넣어 `.dark`로 바꿀 수 없다.
- 기각 사유: 다크 모드와 shadcn 변수 구조를 만들 수 없다. 이 도구는 `npm run design:lint`(검사)에만 쓴다.

### shadcn 공식 CLI(`npx shadcn add`)

- 장점: 공식 경로이고 의존성 설치까지 해 준다.
- 단점: 결정 당시에는 화면에 package.json이 없어 CLI가 새 프로젝트 만들기 흐름으로 빠졌다(ADR-0008로 해소).
  또 지금 레지스트리 파일은 shadcn의 새 `cn` 패키지(clsx + tailwind-merge 대체, 2026-09-22 공개)를 `import { cn } from "cn"`으로 직접 부른다.
  그러면 DESIGN.md 글자 단계를 등록한 `@/lib/class-names`를 거치지 않아 `text-body-sm` 같은 클래스가 색과 충돌해 지워진다.
- 기각 사유: 받은 파일이 우리 `cn`을 쓰게 하려면 import를 바꾸는 단계가 필요하다. `ui:add`가 그 일을 한다.
  (처음에는 `cn`을 무관한 패키지로 잘못 판단했다. shadcn 공식 `cn`으로 옮기는 안은 handoff에 적었다.)

## 이유

값을 DESIGN.md 한 곳에 두면 사람이 읽는 설명과 코드가 쓰는 값이 같은 파일에서 함께 바뀐다. 생성 단계를 둔 것은 다크 모드와 shadcn 이름 체계를 지키기 위해서다.
작은 생성 스크립트 두 개(각 100줄 안팎)를 유지하는 비용이 들지만, 대신 공식 도구의 빈틈 없이 토큰 → CSS 변수 → Tailwind 유틸리티 → shadcn 컴포넌트가 한 줄로 이어진다.

## 결과

- 색·글자·모서리는 토큰 유틸리티(`bg-brand`, `text-entry-title`, `rounded-lg`)로만 쓴다. Tailwind 기본 팔레트와 임의 색 값은 쓰지 않는다.
- DESIGN.md를 고치면 `npm run design:tokens`를 돌려야 한다. 잊으면 `npm test`가 실패한다.
- 새 `typography` 항목은 `design-token-names.ts`를 통해 `cn`(tailwind-merge)에 글자 크기로 등록된다. 등록되지 않으면 `text-muted-foreground`와 충돌해 지워진다.
- `apps/web/src/components/ui/`는 shadcn 원본을 거의 그대로 두는 곳이라, import에 확장자가 없는 등 저장소 규칙과 다를 수 있다.
- 화면 번들에 폰트 파일(Pretendard 조각 수십 개)이 들어간다. 브라우저는 실제로 쓰인 글자 조각만 받는다.
