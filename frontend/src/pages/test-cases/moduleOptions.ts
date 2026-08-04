import type { TestModule } from '../../services/contracts';

const HIDDEN_MODULE_GROUP_IDS = new Set(['core']);

export function visibleModuleTree(modules: TestModule[]): TestModule[] {
  return modules.flatMap((module) => {
    const children = visibleModuleTree(module.children);
    if (HIDDEN_MODULE_GROUP_IDS.has(module.id)) return children;
    return [{ ...module, children }];
  });
}

export function moduleSelectOptions(
  modules: TestModule[],
  parentPath = '',
): Array<{ value: string; label: string }> {
  return visibleModuleTree(modules).flatMap((module) => {
    const path = parentPath ? `${parentPath} / ${module.name}` : module.name;
    return module.children.length
      ? moduleSelectOptions(module.children, path)
      : [{ value: module.id, label: path }];
  });
}
