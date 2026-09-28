/** 조건부 클래스 이름을 합치고, 겹치는 Tailwind 유틸리티는 뒤의 것만 남긴다. shadcn/ui 컴포넌트가 import한다. */
import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { TYPOGRAPHY_TOKEN_NAMES } from '@/styles/design-token-names';

// DESIGN.md의 글자 단계(`text-body-sm` 등)를 글자 크기로 알려 준다. 모르면 색으로 보고 `text-muted-foreground`와 충돌시켜 지운다.
const mergeTailwindClasses = extendTailwindMerge({ extend: { theme: { text: [...TYPOGRAPHY_TOKEN_NAMES] } } });

/** `cn('px-2', isActive && 'bg-sidebar-accent', className)` */
export function cn(...inputs: ClassValue[]): string {
  return mergeTailwindClasses(clsx(inputs));
}
