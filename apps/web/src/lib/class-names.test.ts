import { cn } from 'cn';
import { describe, expect, it } from 'vitest';

describe('cn', () => {
  it('"cn" import가 이 앱의 cn으로 연결돼 DESIGN.md 글자 단계와 색을 둘 다 남긴다', () => {
    expect(cn('text-body-sm text-sidebar-foreground', 'text-body-sm-medium text-sidebar-accent-foreground')).toBe(
      'text-body-sm-medium text-sidebar-accent-foreground',
    );
    expect(cn('text-sm text-primary-foreground', 'text-button-md')).toBe('text-primary-foreground text-button-md');
  });
});
