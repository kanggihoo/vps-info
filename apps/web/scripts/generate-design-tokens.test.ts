import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_MARKDOWN_PATH,
  DESIGN_TOKEN_NAMES_PATH,
  DESIGN_TOKENS_CSS_PATH,
  renderDesignTokenNamesModule,
  renderDesignTokensCss,
} from './generate-design-tokens.ts';

const makeDesignMarkdown = (darkColors: string) => `---
fonts:
  sans: '"Geist Variable", sans-serif'
  mono: '"Geist Mono Variable", monospace'
colors:
  background: "#ffffff"
  brand: "#00d4a4"
colors-dark:
${darkColors}
typography:
  entry-title:
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.40
rounded:
  lg: 12px
---

# 본문
`;

describe('renderDesignTokensCss', () => {
  it('라이트는 :root, 다크는 .dark에 두고 @theme inline으로 Tailwind 유틸리티에 잇는다', () => {
    const css = renderDesignTokensCss(makeDesignMarkdown('  background: "#0a0a0a"\n  brand: "#00d4a4"'));

    expect(css).toContain(':root {\n  --background: #ffffff;\n  --brand: #00d4a4;\n}');
    expect(css).toContain('.dark {\n  --background: #0a0a0a;');
    expect(css).toContain('--color-brand: var(--brand);');
    expect(css).toContain('--font-sans: "Geist Variable", sans-serif;');
    expect(css).toContain('--text-entry-title: 16px;\n  --text-entry-title--line-height: 1.4;\n  --text-entry-title--font-weight: 600;');
    expect(css).toContain('--radius-lg: 12px;');
  });

  it('colors-dark에 빠진 키가 있으면 멈춘다', () => {
    expect(() => renderDesignTokensCss(makeDesignMarkdown('  background: "#0a0a0a"'))).toThrow('dark에 없음: [brand]');
  });

  it('글자 단계 이름을 tailwind-merge 등록용 목록으로 내보낸다', () => {
    const module = renderDesignTokenNamesModule(makeDesignMarkdown('  background: "#0a0a0a"\n  brand: "#00d4a4"'));
    expect(module).toContain("export const TYPOGRAPHY_TOKEN_NAMES = ['entry-title'] as const;");
  });

  it('커밋된 생성 파일이 DESIGN.md와 맞는다(어긋나면 npm run design:tokens)', () => {
    const designMarkdown = readFileSync(DESIGN_MARKDOWN_PATH, 'utf8');
    expect(readFileSync(DESIGN_TOKENS_CSS_PATH, 'utf8')).toBe(renderDesignTokensCss(designMarkdown));
    expect(readFileSync(DESIGN_TOKEN_NAMES_PATH, 'utf8')).toBe(renderDesignTokenNamesModule(designMarkdown));
  });
});
