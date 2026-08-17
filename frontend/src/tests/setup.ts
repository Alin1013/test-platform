/**
 * 测试初始化：jest-dom 断言扩展与 ResizeObserver 桩。
 */
import '@testing-library/jest-dom/vitest';

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  }),
});

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: () => 'blob:test-download',
});

Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: () => undefined,
});

const browserGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (element: Element) => browserGetComputedStyle(element);
