/**
 * 화면(web/) 빌드와 개발 서버 설정.
 * 로컬에서는 호스트에서 `npm run dev:web`으로 띄우고, `/api` 요청은 Compose로 띄운 app 컨테이너로 넘긴다(ADR-0001).
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: { '/api': `http://localhost:${process.env.APP_PORT ?? 8000}` },
  },
});
