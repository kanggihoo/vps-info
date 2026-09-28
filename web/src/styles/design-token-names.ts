/** 이 파일은 `npm run design:tokens`가 web/DESIGN.md의 YAML 토큰으로 만든다. 손으로 고치지 말고 DESIGN.md를 고친다. */

/** `text-<이름>` 글자 단계. `cn`이 같은 그룹(글자 크기)으로 묶어 충돌을 판단한다. */
export const TYPOGRAPHY_TOKEN_NAMES = ['app-title', 'entry-title', 'body-sm', 'body-sm-medium', 'caption', 'caption-bold', 'micro-uppercase', 'button-md', 'numeric-sm', 'numeric-badge'] as const;
