/**
 * Entry 대화에 쓰는 pi-ai 모델 모음과 화면에 보일 엔진 목록(ADR-0018).
 *
 * 엔진 값은 pi-ai provider id 그대로다. 인증은 provider가 알아서 찾는다.
 * - `anthropic`·`openai`: 인증 파일의 구독 로그인(Claude Pro/Max, ChatGPT). 토큰 갱신도 pi-ai가 하고 이 파일에 되돌려 쓴다
 * - `openrouter`: `OPENROUTER_API_KEY`
 */
import { createModels, type Models } from '@earendil-works/pi-ai/models';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import type { LlmEngine, LlmModelsView } from '@trendboda/api-types';
import { FileCredentialStore } from './file-credential-store.ts';

/** 모델 id에서 `major.minor` 버전을 읽어 비교하기 쉬운 수(`5.5` → 505)로 바꾼다. 못 읽으면 0. */
function readModelVersion(id: string, pattern: RegExp): number {
  const match = pattern.exec(id);
  return match ? Number(match[1]) * 100 + Number(match[2] ?? 0) : 0;
}

/**
 * 엔진마다 화면 이름, 드롭다운에 남길 모델, 맨 앞에 둘 기본 모델. 이 순서대로 드롭다운에 나온다.
 * pi-ai 카탈로그에는 옛 모델까지 다 들어 있어 최신 세대만 남긴다. 화면은 저장된 선택이 없으면 첫 엔진의 첫 모델을 고른다.
 */
const ENGINES: Record<LlmEngine, { title: string; keepModel: (id: string) => boolean; defaultModel?: string }> = {
  // `claude-sonnet-5-5`처럼 날짜가 붙지 않은 id만 읽는다. 5.5 미만은 뺀다.
  anthropic: { title: 'Claude', keepModel: (id) => readModelVersion(id, /^claude-[a-z]+-(\d+)(?:-(\d+))?$/) >= 505, defaultModel: 'claude-sonnet-5-5' },
  // `gpt-6-luna`, `gpt-6.1-sol`. 6 미만과 o 계열은 뺀다.
  openai: { title: 'OpenAI', keepModel: (id) => readModelVersion(id, /^gpt-(\d+)(?:\.(\d+))?\b/) >= 600, defaultModel: 'gpt-6-luna' },
  // 400개 가까운 카탈로그에서 DeepSeek만 남긴다. `~deepseek/…`는 최신 모델을 가리키는 별칭이다.
  openrouter: { title: 'OpenRouter', keepModel: (id) => id.includes('deepseek/') },
};

/** 세 provider를 등록한 모델 모음을 만든다. @param credentialFile - pi-ai CLI가 쓰는 `auth.json` 경로 */
export function createLlmModels(credentialFile: string): Models {
  const models = createModels({ credentials: new FileCredentialStore(credentialFile) });
  for (const provider of [anthropicProvider(), openaiProvider(), openrouterProvider()]) models.setProvider(provider);
  return models;
}

/** 엔진별 사용 가능 여부와 모델 목록. 모델 목록은 pi-ai에 내장된 카탈로그를 거른 것이고, 기본 모델이 맨 앞이다. */
export async function listEngines(models: Models): Promise<LlmModelsView> {
  const engines = await Promise.all(
    (Object.keys(ENGINES) as LlmEngine[]).map(async (engine) => {
      const { title, keepModel, defaultModel } = ENGINES[engine];
      const kept = models.getModels(engine).filter((model) => keepModel(model.id));
      const ordered = [...kept.filter((model) => model.id === defaultModel), ...kept.filter((model) => model.id !== defaultModel)];
      return {
        engine,
        title,
        available: (await models.checkAuth(engine)) !== undefined,
        models: ordered.map((model) => ({ value: model.id, title: model.name })),
      };
    }),
  );
  return { engines };
}
