import { describe, expect, it } from 'vitest';
import { rewriteRegistryImports } from './add-shadcn-component.ts';

describe('rewriteRegistryImports', () => {
  it('cn과 레지스트리 경로 import를 이 저장소 경로로 바꾼다', () => {
    const source = [
      'import { cn } from "cn"',
      "import { cn as merge } from '@/lib/utils'",
      'import { Button } from "@/registry/radix-vega/ui/button"',
      'import { Slot } from "radix-ui"',
    ].join('\n');

    expect(rewriteRegistryImports(source)).toBe(
      [
        'import { cn } from "@/lib/class-names"',
        'import { cn as merge } from "@/lib/class-names"',
        'import { Button } from "@/components/ui/button"',
        'import { Slot } from "radix-ui"',
      ].join('\n'),
    );
  });
});
