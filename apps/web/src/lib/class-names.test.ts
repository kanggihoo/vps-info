import { describe, expect, it } from 'vitest';
import { cn } from './class-names.ts';

describe('cn', () => {
  it('DESIGN.md 글자 단계와 색을 서로 다른 그룹으로 보고 둘 다 남긴다', () => {
    expect(cn('text-body-sm text-sidebar-foreground', 'text-body-sm-medium text-sidebar-accent-foreground')).toBe(
      'text-body-sm-medium text-sidebar-accent-foreground',
    );
    expect(cn('text-xs text-primary-foreground', 'text-numeric-badge text-brand-foreground')).toBe(
      'text-numeric-badge text-brand-foreground',
    );
  });
});
