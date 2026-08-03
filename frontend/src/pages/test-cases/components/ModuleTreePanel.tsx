import { EllipsisOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Dropdown, Input, Modal, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo, useState } from 'react';

interface ModuleNode {
  id: string;
  label: string;
  children?: ModuleNode[];
}

interface ModuleTreePanelProps {
  selectedModule: string;
  onSelect: (moduleId: string) => void;
}

const initialModuleTree: ModuleNode[] = [
  {
    id: 'core',
    label: '核心模块',
    children: [
      { id: 'auth', label: '鉴权' },
      { id: 'payments', label: '支付' },
      { id: 'profile', label: '用户资料' },
    ],
  },
];

type DialogState =
  | { type: 'rename'; node: ModuleNode }
  | { type: 'add'; node: ModuleNode }
  | { type: 'addRoot' }
  | { type: 'delete'; node: ModuleNode }
  | null;

function countNodes(nodes: ModuleNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children ?? []), 0);
}

function updateNode(nodes: ModuleNode[], nodeId: string, update: (node: ModuleNode) => ModuleNode): ModuleNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) return update(node);
    if (!node.children?.length) return node;
    return { ...node, children: updateNode(node.children, nodeId, update) };
  });
}

function removeNode(nodes: ModuleNode[], nodeId: string): ModuleNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => (node.children?.length ? { ...node, children: removeNode(node.children, nodeId) } : node));
}

function findNode(nodes: ModuleNode[], nodeId: string): ModuleNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children ?? [], nodeId);
    if (child) return child;
  }
  return undefined;
}

export function ModuleTreePanel({ selectedModule, onSelect }: ModuleTreePanelProps) {
  const [moduleTree, setModuleTree] = useState(initialModuleTree);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [draftName, setDraftName] = useState('');

  const moduleCount = useMemo(
    () => Math.max(0, countNodes(moduleTree) - moduleTree.length),
    [moduleTree],
  );

  const openDialog = (type: Exclude<DialogState, null>['type'], node: ModuleNode) => {
    setDraftName(type === 'rename' ? node.label : '');
    setDialog({ type, node } as DialogState);
  };

  const handleMenuClick = (node: ModuleNode, key: string) => {
    if (key === 'delete') {
      setDialog({ type: 'delete', node });
      return;
    }
    openDialog(key as 'rename' | 'add', node);
  };

  const menuFor = (node: ModuleNode): MenuProps => ({
    items: [
      { key: 'add', label: '新增子目录' },
      { key: 'rename', label: '重命名' },
      { type: 'divider' },
      { key: 'delete', label: '删除', danger: true },
    ],
    onClick: ({ key }) => handleMenuClick(node, key),
  });

  const submitName = () => {
    const label = draftName.trim();
    if (!label || !dialog || dialog.type === 'delete') return;

    if (dialog.type === 'addRoot') {
      const rootNode: ModuleNode = {
        id: `root-${Date.now()}`,
        label,
      };
      setModuleTree((nodes) => [...nodes, rootNode]);
    } else if (dialog.type === 'rename') {
      setModuleTree((nodes) => updateNode(nodes, dialog.node.id, (node) => ({ ...node, label })));
    } else {
      const child: ModuleNode = {
        id: `${dialog.node.id}-${Date.now()}`,
        label,
      };
      setModuleTree((nodes) =>
        updateNode(nodes, dialog.node.id, (node) => ({
          ...node,
          children: [...(node.children ?? []), child],
        })),
      );
    }
    setDialog(null);
  };

  const deleteNode = () => {
    if (!dialog || dialog.type !== 'delete') return;
    setModuleTree((nodes) => removeNode(nodes, dialog.node.id));
    if (selectedModule === dialog.node.id || findNode([dialog.node], selectedModule)) onSelect('all');
    setDialog(null);
  };

  const renderActions = (node: ModuleNode) => (
    <Dropdown trigger={['click']} menu={menuFor(node)} placement="bottomRight">
      <Button
        type="text"
        size="small"
        className="module-panel__actions"
        aria-label={`${node.label} 操作`}
        icon={<EllipsisOutlined />}
        onClick={(event) => event.stopPropagation()}
      />
    </Dropdown>
  );

  const renderNode = (node: ModuleNode, level: number) => (
    <div key={node.id} className="module-panel__branch">
      <div className="module-panel__item-row">
        <button
          type="button"
          role="treeitem"
          aria-selected={selectedModule === node.id}
          className={`module-panel__item${selectedModule === node.id ? ' is-selected' : ''}`}
          style={{ paddingInlineStart: 14 + level * 18 }}
          onClick={() => onSelect(node.id)}
        >
          <span className="module-panel__node" />
          <span className="module-panel__label">{node.label}</span>
        </button>
        {renderActions(node)}
      </div>
      {node.children?.map((child) => renderNode(child, level + 1))}
    </div>
  );

  return (
    <aside className="module-panel" aria-label="模块树">
      <div className="module-panel__title">
        <h2>模块</h2>
        <span className="module-panel__count">{moduleCount} 个业务模块</span>
        <Tooltip title="新增根目录">
          <Button
            type="text"
            size="small"
            className="module-panel__root-action"
            aria-label="新增根目录"
            icon={<PlusOutlined />}
            onClick={() => {
              setDraftName('');
              setDialog({ type: 'addRoot' });
            }}
          />
        </Tooltip>
      </div>
      <div role="tree" aria-label="用例模块">
        <button
          type="button"
          role="treeitem"
          aria-selected={selectedModule === 'all'}
          className={`module-panel__item${selectedModule === 'all' ? ' is-selected' : ''}`}
          style={{ paddingInlineStart: 14 }}
          onClick={() => onSelect('all')}
        >
          <span className="module-panel__node" />
          <span className="module-panel__label">全部模块</span>
        </button>
        {moduleTree.map((rootNode) => (
          <div key={rootNode.id} className="module-panel__group">
            <div className="module-panel__group-row">
              <span className="module-panel__label">{rootNode.label}</span>
              {renderActions(rootNode)}
            </div>
            {rootNode.children?.map((node) => renderNode(node, 1))}
          </div>
        ))}
      </div>

      <Modal
        title={
          dialog?.type === 'rename'
            ? '重命名模块'
            : dialog?.type === 'add'
              ? '新增子目录'
              : dialog?.type === 'addRoot'
                ? '新增根目录'
                : undefined
        }
        open={dialog?.type === 'rename' || dialog?.type === 'add' || dialog?.type === 'addRoot'}
        destroyOnHidden
        okText="确定"
        cancelText="取消"
        onOk={submitName}
        onCancel={() => setDialog(null)}
        okButtonProps={{ 'aria-label': '确定', disabled: !draftName.trim() }}
        cancelButtonProps={{ 'aria-label': '取消' }}
      >
        <Input
          aria-label="目录名称"
          placeholder="请输入目录名称"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onPressEnter={submitName}
        />
      </Modal>

      <Modal
        title="删除模块"
        open={dialog?.type === 'delete'}
        destroyOnHidden
        okText="删除"
        cancelText="取消"
        okButtonProps={{ 'aria-label': '删除', danger: true }}
        cancelButtonProps={{ 'aria-label': '取消' }}
        onOk={deleteNode}
        onCancel={() => setDialog(null)}
      >
        确定删除“{dialog?.type === 'delete' ? dialog.node.label : ''}”及其子目录吗？
      </Modal>
    </aside>
  );
}
