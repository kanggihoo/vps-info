/** OpenRouter 공개 API로 새로 추가된 모델을 가져오는 Handler. 인증이 필요 없다. */
import { defineHandler } from './define-handler.ts';
import { toSummaryText } from './summary-text.ts';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** `/api/v1/models` 응답 중 쓰는 필드. */
type OpenRouterModel = {
  id: string;
  name: string;
  /** 모델이 OpenRouter에 추가된 시각(유닉스 초). */
  created: number;
  description?: string;
  context_length?: number;
  /** 토큰당 USD 가격 문자열. */
  pricing?: { prompt?: string; completion?: string };
};

export const openrouterModelsHandler = defineHandler<Record<string, never>>({
  async fetchEntries(_params, { httpClient }) {
    const { data: models } = await httpClient<{ data: OpenRouterModel[] }>(MODELS_URL);
    return models.map((model) => ({
      url: `https://openrouter.ai/${model.id}`,
      title: model.name,
      externalId: model.id,
      publishedAt: new Date(model.created * 1000),
      summary: toSummaryText(model.description),
      extra: {
        contextLength: model.context_length,
        promptPricePerToken: model.pricing?.prompt,
        completionPricePerToken: model.pricing?.completion,
      },
      raw: model,
    }));
  },
});
