interface ModuleTreePanelProps {
  selectedModule: string;
  onSelect: (moduleId: string) => void;
}

const modules = [
  { id: 'all', label: '全部模块', level: 0 },
  { id: 'core', label: '核心模块', level: 0, group: true },
  { id: 'auth', label: '鉴权', level: 1 },
  { id: 'payments', label: '支付', level: 1 },
  { id: 'profile', label: '用户资料', level: 1 },
];

export function ModuleTreePanel({ selectedModule, onSelect }: ModuleTreePanelProps) {
  return (
    <aside className="module-panel" aria-label="模块树">
      <div className="module-panel__title">
        <h2>模块</h2>
        <span>3 个业务模块</span>
      </div>
      <div role="tree" aria-label="用例模块">
        {modules.map((module) =>
          module.group ? (
            <div key={module.id} className="module-panel__group">
              {module.label}
            </div>
          ) : (
            <button
              key={module.id}
              type="button"
              role="treeitem"
              aria-selected={selectedModule === module.id}
              className={`module-panel__item${selectedModule === module.id ? ' is-selected' : ''}`}
              style={{ paddingInlineStart: 14 + module.level * 18 }}
              onClick={() => onSelect(module.id)}
            >
              <span className="module-panel__node" />
              {module.label}
            </button>
          ),
        )}
      </div>
    </aside>
  );
}
