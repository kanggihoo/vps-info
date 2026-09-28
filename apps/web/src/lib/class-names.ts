/**
 * 이 앱의 `cn`. 조건부 클래스 이름을 합치고, 겹치는 Tailwind 유틸리티는 뒤의 것만 남긴다.
 *
 * shadcn 컴포넌트는 `import { cn } from "cn"`으로 기본 `cn` 패키지를 부른다. 기본 `cn`은 DESIGN.md의 글자 단계
 * (`text-body-sm` 등)를 몰라서 색으로 보고 `text-muted-foreground`와 충돌시켜 지운다. 그래서 `vite.config.ts`와
 * `tsconfig.json`이 `"cn"` import를 이 파일로 돌리고, 여기서 글자 단계를 등록한 `cn`을 만든다(ADR-0007).
 * 이 파일 안에서는 `"cn"`을 import하지 않는다. 자기 자신을 가리키게 된다. 설정 API는 `cn/config`에서 가져온다.
 */
import { createCn } from 'cn/config';
import { TYPOGRAPHY_TOKEN_NAMES } from '@/styles/design-token-names';

/** `cn('px-2', isActive && 'bg-sidebar-accent', className)` */
export const cn = createCn({ extend: { classGroups: { 'font-size': [{ text: [...TYPOGRAPHY_TOKEN_NAMES] }] } } });
