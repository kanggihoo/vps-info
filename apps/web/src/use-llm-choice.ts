/**
 * Entry 대화에 쓸 엔진·모델 선택(ADR-0015). 사이드바의 드롭다운 하나로 고르고, 모든 Entry 대화에 쓴다.
 * 고른 값은 브라우저 `localStorage`에 남긴다. 혼자 쓰는 앱이라 기기 사이에 맞출 필요가 없다.
 */
import { useCallback, useEffect, useState } from 'react';
import type { LlmEngine, LlmModelsView } from '@trendboda/api-types';
import { apiClient } from './api-client.ts';

const LLM_CHOICE_STORAGE_KEY = 'llm-choice';

/** 고른 엔진과 모델. */
export type LlmChoice = { engine: LlmEngine; model: string };

function readSavedChoice(): LlmChoice | undefined {
  try {
    const saved = localStorage.getItem(LLM_CHOICE_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as LlmChoice) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 저장된 선택이 지금도 쓸 수 있으면 그대로, 아니면 쓸 수 있는 첫 엔진의 첫 모델을 고른다.
 * 엔진 인증이 빠졌거나 모델이 목록에서 사라진 뒤에도 쓸 수 있는 값이 고정되게 한다.
 *
 * @returns 쓸 수 있는 엔진이 하나도 없으면 `undefined`
 */
export function pickLlmChoice(models: LlmModelsView, saved: LlmChoice | undefined): LlmChoice | undefined {
  const availableEngines = models.engines.filter((engine) => engine.available && engine.models.length > 0);
  const savedEngine = availableEngines.find((engine) => engine.engine === saved?.engine);
  if (saved && savedEngine?.models.some((model) => model.value === saved.model)) return saved;
  const fallback = savedEngine ?? availableEngines[0];
  return fallback && { engine: fallback.engine, model: fallback.models[0].value };
}

/** @returns 엔진·모델 목록(받는 중이면 `undefined`), 지금 선택, 선택을 바꾸는 함수 */
export function useLlmChoice() {
  const [models, setModels] = useState<LlmModelsView | undefined>();
  const [saved, setSaved] = useState(readSavedChoice);

  useEffect(() => {
    apiClient
      .listLlmModels()
      .then(setModels)
      .catch((error: unknown) => {
        console.error(error);
        setModels({ engines: [] });
      });
  }, []);

  const chooseLlm = useCallback((choice: LlmChoice) => {
    try {
      localStorage.setItem(LLM_CHOICE_STORAGE_KEY, JSON.stringify(choice));
    } catch {
      // 저장소가 막힌 브라우저에서는 이번 방문 동안만 유지된다.
    }
    setSaved(choice);
  }, []);

  return { llmModels: models, llmChoice: models && pickLlmChoice(models, saved), chooseLlm };
}

/** 선택을 화면 이름으로 바꾼다(`Claude · Sonnet`). 목록에 없으면 값 그대로 쓴다. */
export function describeLlmChoice(models: LlmModelsView | undefined, choice: LlmChoice | undefined): string {
  if (!choice) return '';
  const engine = models?.engines.find((candidate) => candidate.engine === choice.engine);
  const model = engine?.models.find((candidate) => candidate.value === choice.model);
  return `${engine?.title ?? choice.engine} · ${model?.title ?? choice.model}`;
}
