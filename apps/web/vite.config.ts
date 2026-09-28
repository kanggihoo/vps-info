/**
 * 화면 빌드와 개발 서버 설정.
 * 로컬에서는 호스트에서 `npm run dev:web`으로 띄우고, `/api` 요청은 Compose로 띄운 app 컨테이너로 넘긴다(ADR-0001).
 */
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * import 별칭. `tsconfig.json`의 `paths`와 맞춘다.
 * - `@/` → `src/`
 * - `cn`(정확히 이 이름만) → 글자 단계를 등록한 이 앱의 `cn`. `cn/config` 같은 하위 경로는 패키지 그대로 쓴다(ADR-0007).
 */
export const WEB_ALIASES = [
  { find: /^cn$/, replacement: resolve(import.meta.dirname, 'src/lib/class-names.ts') },
  { find: '@', replacement: resolve(import.meta.dirname, 'src') },
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: WEB_ALIASES },
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: { '/api': `http://localhost:${process.env.APP_PORT ?? 8000}` },
  },
});
