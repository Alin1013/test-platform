/**
 * 调试变量编辑器：可开关的键值对列表，供 API/UI 调试表单复用。
 */
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input, Tooltip } from 'antd';
import type { ApiKeyValueItem } from '../../../services/contracts';

export function debugVariablesToRecord(items: ApiKeyValueItem[] = []) {
  // 只取启用且变量名非空的项，转换为 {key: value} 对象。
  return Object.fromEntries(
    items
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => [item.key.trim(), item.value]),
  );
}

export function DebugVariableEditor() {
  return (
    <Form.List name="debugVariables">
      {(fields, { add, remove }) => (
        <div className="debug-variable-editor">
          <div className="debug-variable-editor__header" aria-hidden="true">
            <span>启用</span>
            <span>变量名</span>
            <span>变量值</span>
            <span />
          </div>
          {fields.map((field, index) => (
            <div className="debug-variable-row" key={field.key}>
              <Form.Item name={[field.name, 'enabled']} valuePropName="checked" noStyle>
                <Checkbox aria-label={`启用调试变量 ${index + 1}`} />
              </Form.Item>
              <Form.Item name={[field.name, 'key']} noStyle>
                <Input aria-label={`调试变量名 ${index + 1}`} placeholder="token" />
              </Form.Item>
              <Form.Item name={[field.name, 'value']} noStyle>
                <Input aria-label={`调试变量值 ${index + 1}`} placeholder="调试值" />
              </Form.Item>
              <Tooltip title="删除变量">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`删除调试变量 ${index + 1}`}
                  onClick={() => remove(field.name)}
                />
              </Tooltip>
            </div>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            aria-label="添加调试变量"
            onClick={() => add({ enabled: true, key: '', value: '' })}
            block
          >
            添加变量
          </Button>
        </div>
      )}
    </Form.List>
  );
}
