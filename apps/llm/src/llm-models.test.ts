import { describe, expect, it } from 'vitest';
import { createLlmModels, listEngines } from './llm-models.ts';

describe('listEngines', () => {
  it('엔진마다 최신 세대만 남기고 기본 모델을 맨 앞에 둔다', async () => {
    const { engines } = await listEngines(createLlmModels('/nonexistent/auth.json'));
    const ids = Object.fromEntries(engines.map((engine) => [engine.engine, engine.models.map((model) => model.value)]));

    expect(ids.anthropic[0]).toBe('claude-sonnet-5-5');
    expect(ids.anthropic).toContain('claude-opus-5-5');
    expect(ids.anthropic).not.toContain('claude-sonnet-5');
    expect(ids.anthropic).not.toContain('claude-fable-5-1');
    expect(ids.anthropic).not.toContain('claude-sonnet-4-5-20250929');

    expect(ids.openai[0]).toBe('gpt-6-luna');
    expect(ids.openai).toContain('gpt-6.1-sol');
    expect(ids.openai.every((id) => /^gpt-6/.test(id))).toBe(true);

    expect(ids.openrouter.length).toBeGreaterThan(0);
    expect(ids.openrouter.every((id) => id.includes('deepseek/'))).toBe(true);
  });
});
