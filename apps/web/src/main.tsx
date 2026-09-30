/** 화면 진입점. 폰트 파일은 npm 패키지에서 번들해 앱이 직접 서빙한다(외부 CDN 없음, DESIGN.md). */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { App } from './app.tsx';
import { EntryChangesProvider } from './entry-changes.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <EntryChangesProvider>
        <App />
      </EntryChangesProvider>
    </TooltipProvider>
  </StrictMode>,
);
