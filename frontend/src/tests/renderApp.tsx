import { render } from '@testing-library/react';
import { App } from '../app/App';

export function renderApp(route = '/') {
  return render(<App router="memory" initialEntries={[route]} />);
}
