/**
 * 화면(web/) 빌드와 개발 서버 설정.
 * 로컬에서는 호스트에서 `npm run dev:web`으로 띄우고, `/api` 요청은 Compose로 띄운 app 컨테이너로 넘긴다(ADR-0001).
 */
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** `@/`는 `web/src`를 가리킨다. `web/tsconfig.json`의 `paths`와 맞춘다. */
export const WEB_SOURCE_ALIAS = { '@': resolve(import.meta.dirname, 'web/src') };

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: WEB_SOURCE_ALIAS },
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: { '/api': `http://localhost:${process.env.APP_PORT ?? 8000}` },
  },
});
