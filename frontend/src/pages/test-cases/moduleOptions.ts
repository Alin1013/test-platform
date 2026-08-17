/**
 * 模块树工具：过滤隐藏分组并生成下拉选项。
 */
import type { TestModule } from '../../services/contracts';

// “core” 是平台内置分组，不在 UI 中展示，但其子模块保留。
const HIDDEN_MODULE_GROUP_IDS = new Set(['core']);

export function visibleModuleTree(modules: TestModule[]): TestModule[] {
  /** 递归过滤隐藏分组，只保留可见模块树。 */
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
  // 递归展开模块树，label 显示完整层级路径（父 / 子）。
  return visibleModuleTree(modules).flatMap((module) => {
    const path = parentPath ? `${parentPath} / ${module.name}` : module.name;
    return [{ module, path }, ...flattenedModuleOptions(module.children, path)];
  });
}

export function moduleSelectOptions(
  modules: TestModule[],
  parentPath = '',
): Array<{ value: string; label: string }> {
  /** 生成模块下拉选项：value 为模块 id，label 为完整路径。 */
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
  /** 生成“项目 / 模块路径”选项，额外携带 moduleId 供保存时使用。 */
  return flattenedModuleOptions(modules, parentPath).map(({ module, path }) => ({
    value: path,
    label: path,
    moduleId: module.id,
  }));
}
