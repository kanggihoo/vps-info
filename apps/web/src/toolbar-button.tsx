/**
 * 상세 패널 도구줄의 아이콘 버튼(ADR-0011).
 */
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from 'cn';

export type ToolbarButtonProps = {
  shortcut?: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  /** 이 Entry에서는 쓸 수 없는 이유. 있으면 버튼은 자리를 지키되 눌리지 않고, 툴팁이 이유를 알린다. */
  unavailableReason?: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
};

/**
 * 도구줄의 아이콘 버튼. 무슨 버튼인지는 툴팁과 `aria-label`로 알린다. 켜진 상태는 민트가 아니라 hover 바탕으로 보인다.
 * 쓸 수 없는 버튼은 숨기지 않고 흐리게 둔다. 도구줄의 개수와 위치가 Feed마다 달라지지 않게 하려는 것이다.
 * `disabled`는 마우스 이벤트를 막아 툴팁이 뜨지 않으므로, 이 경우는 `aria-disabled`로 두고 클릭만 무시한다.
 */
export function ToolbarButton({ shortcut, label, pressed, disabled, unavailableReason, className, onClick, children }: ToolbarButtonProps) {
  const unavailable = unavailableReason !== undefined;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('rounded-full max-md:size-11 data-[shortcut-active=true]:bg-accent [&_svg]:stroke-[1.5]', pressed && 'bg-accent text-foreground', unavailable && 'cursor-not-allowed opacity-50 hover:bg-transparent active:translate-y-0 dark:hover:bg-transparent', className)}
          data-tool-code={shortcut ? `Key${shortcut}` : undefined}
          aria-keyshortcuts={unavailable ? undefined : shortcut}
          aria-label={unavailable ? unavailableReason : label}
          aria-pressed={unavailable ? undefined : pressed}
          aria-disabled={unavailable || undefined}
          disabled={disabled}
          onClick={unavailable ? undefined : onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">{unavailable ? unavailableReason : label}{shortcut && !unavailable && <Kbd className="text-caption">{shortcut}</Kbd>}</TooltipContent>
    </Tooltip>
  );
}
