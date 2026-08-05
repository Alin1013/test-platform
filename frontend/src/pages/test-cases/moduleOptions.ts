import type { TestModule } from '../../services/contracts';

const HIDDEN_MODULE_GROUP_IDS = new Set(['core']);

export function visibleModuleTree(modules: TestModule[]): TestModule[] {
  return modules.flatMap((module) => {
    const children = visibleModuleTree(module.children);
    if (HIDDEN_MODULE_GROUP_IDS.has(module.id)) return children;
    return [{ ...module, children }];
  });
}

function flattenedModuleOptions(
  modules: TestModule[],
  parentPath = '',
): Array<{ module: TestModule; path: string }> {
  return visibleModuleTree(modules).flatMap((module) => {
    const path = parentPath ? `${parentPath} / ${module.name}` : module.name;
    return [{ module, path }, ...flattenedModuleOptions(module.children, path)];
  });
}

export function moduleSelectOptions(
  modules: TestModule[],
  parentPath = '',
): Array<{ value: string; label: string }> {
  return flattenedModuleOptions(modules, parentPath).map(({ module, path }) => ({
    value: module.id,
    label: path,
  }));
}

export interface ModuleProjectOption {
  value: string;
  label: string;
  moduleId: string;
}

export function moduleProjectOptions(
  modules: TestModule[],
  parentPath = '',
): ModuleProjectOption[] {
  return flattenedModuleOptions(modules, parentPath).map(({ module, path }) => ({
    value: path,
    label: path,
    moduleId: module.id,
  }));
}
