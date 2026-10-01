/**
 * 사이드바 아래쪽의 대화 엔진·모델 드롭다운(ADR-0015). 엔진마다 `optgroup` 하나로, 고른 값은 모든 Entry 대화에 쓴다.
 * 인증 정보가 없는 엔진은 이름 옆에 적고 고를 수 없게 한다. 쓸 수 있는 엔진이 없으면 드롭다운을 끈다.
 */
import type { LlmEngine, LlmModelsView } from '@trendboda/api-types';
import { cn } from 'cn';
import type { LlmChoice } from './use-llm-choice.ts';

type LlmChoiceSelectProps = {
  models: LlmModelsView | undefined;
  choice: LlmChoice | undefined;
  onChoose: (choice: LlmChoice) => void;
};

export function LlmChoiceSelect({ models, choice, onChoose }: LlmChoiceSelectProps) {
  return (
    <select
      aria-label="Entry 대화 엔진과 모델"
      value={choice ? `${choice.engine}:${choice.model}` : ''}
      disabled={!choice}
      onChange={(event) => {
        const [engine, ...model] = event.target.value.split(':');
        onChoose({ engine: engine as LlmEngine, model: model.join(':') });
      }}
      className={cn(
        'h-8 shrink-0 rounded-full border border-input bg-background px-3 text-body-sm text-foreground max-md:h-11 md:w-full',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground',
      )}
    >
      {!choice && <option value="">{models ? '대화 엔진 없음' : '대화 엔진 확인 중'}</option>}
      {models?.engines.map((engine) => (
        <optgroup key={engine.engine} label={engine.available ? engine.title : `${engine.title} (인증 정보 없음)`} disabled={!engine.available}>
          {engine.models.map((model) => (
            <option key={model.value} value={`${engine.engine}:${model.value}`}>
              {engine.title} · {model.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
