/**
 * `DESIGN.md`의 YAML 토큰으로 `src/styles/`의 두 파일을 만든다(`npm run design:tokens`).
 * - `design-tokens.css`: CSS 변수와 Tailwind 연결
 * - `design-token-names.ts`: 글자 단계 이름. `cn`(tailwind-merge)이 `text-body-sm`을 색으로 오해해 지우지 않게 알려 준다.
 *
 * 색은 shadcn/ui 변수 이름 그대로 `:root`(라이트)와 `.dark`(다크)에 두고, `@theme inline`으로 Tailwind 유틸리티에 잇는다.
 * `@google/design.md export`는 `colors-dark`와 폰트 대체 목록을 다루지 못해서 이 스크립트를 따로 둔다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

/** 입력·출력 경로(`apps/web` 기준). */
export const DESIGN_MARKDOWN_PATH = resolve(import.meta.dirname, '../DESIGN.md');
export const DESIGN_TOKENS_CSS_PATH = resolve(import.meta.dirname, '../src/styles/design-tokens.css');
export const DESIGN_TOKEN_NAMES_PATH = resolve(import.meta.dirname, '../src/styles/design-token-names.ts');

type Typography = {
  fontSize: string;
  fontWeight?: number;
  lineHeight?: number | string;
  letterSpacing?: string;
};

type DesignTokens = {
  fonts: { sans: string; mono: string };
  colors: Record<string, string>;
  'colors-dark': Record<string, string>;
  typography: Record<string, Typography>;
  rounded: Record<string, string>;
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** DESIGN.md 맨 위 `---`로 둘러싼 YAML을 읽는다. */
function readDesignTokens(designMarkdown: string): DesignTokens {
  const frontMatter = designMarkdown.replaceAll('\r\n', '\n').match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontMatter) throw new Error('DESIGN.md 맨 위에 YAML 머리말(---)이 없습니다.');
  return parse(frontMatter[1]) as DesignTokens;
}

/** 라이트와 다크가 같은 변수를 덮어쓰므로 키가 하나라도 어긋나면 한쪽 모드에서 색이 빠진다. */
function checkColorModes(lightColors: Record<string, string>, darkColors: Record<string, string>): void {
  const lightNames = Object.keys(lightColors);
  const darkNames = Object.keys(darkColors);
  const missingInDark = lightNames.filter((name) => !(name in darkColors));
  const missingInLight = darkNames.filter((name) => !(name in lightColors));
  if (missingInDark.length || missingInLight.length)
    throw new Error(`colors와 colors-dark의 키가 다릅니다. dark에 없음: [${missingInDark}] / light에 없음: [${missingInLight}]`);
  for (const [name, value] of [...Object.entries(lightColors), ...Object.entries(darkColors)])
    if (!HEX_COLOR_PATTERN.test(value)) throw new Error(`색 ${name}의 값 ${value}가 #rrggbb 형식이 아닙니다.`);
}

function renderDeclarations(declarations: [string, string | number][]): string {
  return declarations.map(([name, value]) => `  --${name}: ${value};`).join('\n');
}

/**
 * DESIGN.md 내용으로 CSS 파일 내용을 만든다.
 *
 * @param designMarkdown - `DESIGN.md` 전체 내용
 * @returns `design-tokens.css`에 그대로 쓸 문자열
 */
export function renderDesignTokensCss(designMarkdown: string): string {
  const tokens = readDesignTokens(designMarkdown);
  checkColorModes(tokens.colors, tokens['colors-dark']);

  const colorNames = Object.keys(tokens.colors);
  const themeDeclarations: [string, string | number][] = [
    ...colorNames.map((name): [string, string] => [`color-${name}`, `var(--${name})`]),
    ['font-sans', tokens.fonts.sans],
    ['font-mono', tokens.fonts.mono],
    ...Object.entries(tokens.typography).flatMap(([name, typography]) => {
      const declarations: [string, string | number][] = [[`text-${name}`, typography.fontSize]];
      if (typography.lineHeight !== undefined) declarations.push([`text-${name}--line-height`, typography.lineHeight]);
      if (typography.fontWeight !== undefined) declarations.push([`text-${name}--font-weight`, typography.fontWeight]);
      if (typography.letterSpacing !== undefined) declarations.push([`text-${name}--letter-spacing`, typography.letterSpacing]);
      return declarations;
    }),
    ...Object.entries(tokens.rounded).map(([name, value]): [string, string] => [`radius-${name}`, value]),
  ];

  return [
    '/* 이 파일은 `npm run design:tokens`가 apps/web/DESIGN.md의 YAML 토큰으로 만든다. 손으로 고치지 말고 DESIGN.md를 고친다. */',
    '',
    ':root {',
    renderDeclarations(Object.entries(tokens.colors)),
    '}',
    '',
    '.dark {',
    renderDeclarations(Object.entries(tokens['colors-dark'])),
    '}',
    '',
    '@theme inline {',
    renderDeclarations(themeDeclarations),
    '}',
    '',
  ].join('\n');
}

/**
 * 글자 단계 이름 목록 모듈을 만든다. Tailwind 기본에 없는 `text-<이름>`을 tailwind-merge에 등록하는 데 쓴다.
 *
 * @param designMarkdown - `DESIGN.md` 전체 내용
 * @returns `design-token-names.ts`에 그대로 쓸 문자열
 */
export function renderDesignTokenNamesModule(designMarkdown: string): string {
  const typographyNames = Object.keys(readDesignTokens(designMarkdown).typography);
  return [
    '/** 이 파일은 `npm run design:tokens`가 apps/web/DESIGN.md의 YAML 토큰으로 만든다. 손으로 고치지 말고 DESIGN.md를 고친다. */',
    '',
    '/** `text-<이름>` 글자 단계. `cn`이 같은 그룹(글자 크기)으로 묶어 충돌을 판단한다. */',
    `export const TYPOGRAPHY_TOKEN_NAMES = [${typographyNames.map((name) => `'${name}'`).join(', ')}] as const;`,
    '',
  ].join('\n');
}

if (process.argv[1] === import.meta.filename) {
  const designMarkdown = readFileSync(DESIGN_MARKDOWN_PATH, 'utf8');
  writeFileSync(DESIGN_TOKENS_CSS_PATH, renderDesignTokensCss(designMarkdown));
  writeFileSync(DESIGN_TOKEN_NAMES_PATH, renderDesignTokenNamesModule(designMarkdown));
  console.log(`생성: ${DESIGN_TOKENS_CSS_PATH}\n생성: ${DESIGN_TOKEN_NAMES_PATH}`);
}
