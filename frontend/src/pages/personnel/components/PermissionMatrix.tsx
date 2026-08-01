import { Checkbox, Empty, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type { PermissionKey, PermissionRole } from '../../../services/contracts';

const permissionColumns: Array<{ key: PermissionKey; label: string }> = [
  { key: 'caseView', label: '用例查看' },
  { key: 'caseEdit', label: '用例编辑' },
  { key: 'xmindConvert', label: 'XMind 转换' },
  { key: 'personnelManage', label: '人员管理' },
  { key: 'systemSettings', label: '系统设置' },
];

export function PermissionMatrix() {
  const service = usePlatformService();
  const [roles, setRoles] = useState<PermissionRole[] | null>(null);

  useEffect(() => {
    let active = true;

    void service
      .listRoles()
      .then((nextRoles) => {
        if (active) setRoles(nextRoles);
      })
      .catch(() => {
        if (active) setRoles([]);
      });

    return () => {
      active = false;
    };
  }, [service]);

  const togglePermission = (roleName: PermissionRole['name'], permission: PermissionKey) => {
    setRoles((current) =>
      current?.map((role) =>
        role.name === roleName
          ? {
              ...role,
              permissions: {
                ...role.permissions,
                [permission]: !role.permissions[permission],
              },
            }
          : role,
      ) ?? null,
    );
  };

  if (!roles) {
    return <Skeleton active paragraph={{ rows: 4 }} />;
  }

  if (!roles.length) {
    return <Empty description="角色权限加载失败" />;
  }

  return (
    <div className="permission-matrix__scroll">
      <table className="permission-matrix" aria-label="权限矩阵">
        <thead>
          <tr>
            <th scope="col">角色</th>
            {permissionColumns.map((permission) => (
              <th key={permission.key} scope="col">
                {permission.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.name}>
              <th scope="row">{role.name}</th>
              {permissionColumns.map((permission) => (
                <td key={permission.key}>
                  <Checkbox
                    aria-label={`${role.name}的${permission.label}权限`}
                    checked={role.permissions[permission.key]}
                    onChange={() => togglePermission(role.name, permission.key)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
