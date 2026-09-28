/**
 * shadcn/ui 컴포넌트를 레지스트리에서 받아 `web/src/components/ui/`에 쓴다(`npm run ui:add -- button tooltip`).
 *
 * 공식 CLI(`npx shadcn add`)를 쓰지 않는 이유:
 * - `web/`에 package.json이 없어 CLI가 새 프로젝트 만들기 흐름으로 빠진다.
 * - 지금 레지스트리 파일은 `import { cn } from "cn"`으로 오는데, CLI가 이를 `components.json`의 utils 별칭으로
 *   바꾸지 않고 npm의 무관한 `cn` 패키지를 설치한다(2026-09 shadcn 3.x·4.21 확인).
 * 그래서 파일만 받아 `cn` import를 `@/lib/class-names`로 바꾸고, npm 의존성은 설치할 목록으로 알려 주기만 한다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const WEB_DIRECTORY = resolve(import.meta.dirname, '../web');
const UI_DIRECTORY = resolve(WEB_DIRECTORY, 'src/components/ui');
const CLASS_NAMES_IMPORT = '@/lib/class-names';

type RegistryItem = {
  name: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: { path: string; content: string }[];
};

/**
 * 레지스트리 파일의 import를 이 저장소 경로로 바꾼다.
 *
 * @param content - 레지스트리가 준 컴포넌트 소스
 */
export function rewriteRegistryImports(content: string): string {
  return content
    .replace(/from ["']cn["']/g, `from "${CLASS_NAMES_IMPORT}"`)
    .replace(/from ["']@\/lib\/utils["']/g, `from "${CLASS_NAMES_IMPORT}"`)
    .replace(/from ["']@\/registry\/[^/]+\/ui\/([^"']+)["']/g, 'from "@/components/ui/$1"');
}

async function fetchRegistryItem(style: string, name: string): Promise<RegistryItem> {
  const response = await fetch(`https://ui.shadcn.com/r/styles/${style}/${name}.json`);
  if (!response.ok) throw new Error(`${name}: 레지스트리 응답 ${response.status}`);
  return (await response.json()) as RegistryItem;
}

async function addComponents(names: string[], overwrite: boolean): Promise<void> {
  const { style } = JSON.parse(readFileSync(resolve(WEB_DIRECTORY, 'components.json'), 'utf8')) as { style: string };
  const pending = [...names];
  const done = new Set<string>();
  const npmDependencies = new Set<string>();

  while (pending.length) {
    const name = pending.shift()!;
    if (done.has(name)) continue;
    done.add(name);
    const item = await fetchRegistryItem(style, name);
    // 레지스트리 안의 다른 컴포넌트(예: dialog → button)도 함께 받는다. URL 형태의 외부 항목은 건너뛴다.
    pending.push(...(item.registryDependencies ?? []).filter((dependency) => !dependency.includes('/')));
    for (const dependency of item.dependencies ?? []) if (dependency !== 'cn') npmDependencies.add(dependency);

    mkdirSync(UI_DIRECTORY, { recursive: true });
    for (const file of item.files) {
      const targetPath = resolve(UI_DIRECTORY, basename(file.path));
      if (existsSync(targetPath) && !overwrite) {
        console.log(`건너뜀(이미 있음, 덮어쓰려면 --overwrite): ${targetPath}`);
        continue;
      }
      writeFileSync(targetPath, rewriteRegistryImports(file.content));
      console.log(`생성: ${targetPath}`);
    }
  }

  if (npmDependencies.size) console.log(`\n필요한 npm 패키지(없으면 설치): npm i -D ${[...npmDependencies].join(' ')}`);
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const names = args.filter((arg) => !arg.startsWith('--'));
  if (!names.length) throw new Error('사용법: npm run ui:add -- <컴포넌트 이름...> [--overwrite]');
  await addComponents(names, args.includes('--overwrite'));
}
