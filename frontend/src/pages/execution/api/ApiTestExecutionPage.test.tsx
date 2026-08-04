import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../../tests/renderApp';

it('配置并启动接口自动化后展示 KPI 与请求分析', async () => {
  const user = userEvent.setup();
  renderApp('/execution/api-test');

  expect(await screen.findByRole('heading', { name: '接口自动化' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '环境配置' }).closest('.ant-select')).toHaveTextContent('Staging');

  await user.click(await screen.findByRole('checkbox', { name: '选择 API-253301 用户资料查询' }));
  await user.click(screen.getByRole('button', { name: '开始执行' }));

  const metrics = await screen.findByRole('region', { name: '接口执行指标' });
  expect(within(metrics).getByText('总请求数')).toBeInTheDocument();
  expect(within(metrics).getByText('平均响应时间')).toBeInTheDocument();
  expect(within(metrics).getByText('通过率')).toBeInTheDocument();
  expect(within(metrics).getByText('失败接口')).toBeInTheDocument();

  await user.click(await screen.findByRole('button', { name: '查看 用户资料查询 请求分析' }));
  const analysis = screen.getByRole('region', { name: '接口结果分析' });
  expect(within(analysis).getByRole('tab', { name: 'Request' })).toBeInTheDocument();
  expect(within(analysis).getByRole('tab', { name: 'Response' })).toBeInTheDocument();
  expect(within(analysis).getByRole('tab', { name: 'Assertions' })).toBeInTheDocument();
  expect(analysis).toHaveTextContent('/api/users/profile');
});

it('接口自动化配置提供迭代、并发间隔和请求头覆盖', async () => {
  renderApp('/execution/api-test');

  await screen.findByRole('heading', { name: '接口自动化' });
  expect(screen.getByRole('spinbutton', { name: '循环次数' })).toHaveValue('1');
  expect(screen.getByRole('spinbutton', { name: '并发间隔' })).toHaveValue('0');
  expect(screen.getByRole('button', { name: '添加请求头' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导出报告' })).toBeDisabled();
});
