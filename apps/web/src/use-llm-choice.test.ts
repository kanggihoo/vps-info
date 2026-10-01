import { describe, expect, it } from 'vitest';
import type { LlmModelsView } from '@trendboda/api-types';
import { pickLlmChoice } from './use-llm-choice.ts';

const models: LlmModelsView = {
  engines: [
    { engine: 'claude', title: 'Claude', available: false, models: [{ value: 'sonnet', title: 'Sonnet' }] },
    {
      engine: 'codex',
      title: 'Codex',
      available: true,
      models: [
        { value: 'gpt-6-sol', title: 'GPT-6-Sol' },
        { value: 'gpt-6-luna', title: 'GPT-6-Luna' },
      ],
    },
  ],
};

describe('pickLlmChoice', () => {
  it('저장된 선택이 쓸 수 있으면 그대로 쓴다', () => {
    expect(pickLlmChoice(models, { engine: 'codex', model: 'gpt-6-luna' })).toEqual({ engine: 'codex', model: 'gpt-6-luna' });
  });

  it('저장된 엔진이 꺼졌으면 쓸 수 있는 첫 엔진의 첫 모델을 고른다', () => {
    expect(pickLlmChoice(models, { engine: 'claude', model: 'sonnet' })).toEqual({ engine: 'codex', model: 'gpt-6-sol' });
  });

  it('저장된 모델이 목록에서 사라졌으면 같은 엔진의 첫 모델을 고른다', () => {
    expect(pickLlmChoice(models, { engine: 'codex', model: 'gpt-5' })).toEqual({ engine: 'codex', model: 'gpt-6-sol' });
  });

  it('쓸 수 있는 엔진이 없으면 고르지 않는다', () => {
    expect(pickLlmChoice({ engines: [] }, undefined)).toBeUndefined();
  });
});
