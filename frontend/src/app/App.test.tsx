import { render, screen } from '@testing-library/react';
import { App } from './App';

it('默认进入仪表盘', async () => {
  render(<App router="memory" initialEntries={['/']} />);
  expect(await screen.findByRole('heading', { name: '仪表盘' })).toBeInTheDocument();
});
