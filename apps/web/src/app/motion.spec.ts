import { motionClass } from './motion';

describe('motionClass', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
  });

  it('applies the shared enter class only after initial rendering', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });

    expect(motionClass(false, 'ui-overlay-enter')).toBe('');
    expect(motionClass(true, 'ui-overlay-enter')).toBe('ui-overlay-enter');
  });

  it('suppresses decorative enter classes for reduced-motion users', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });

    expect(motionClass(true, 'ui-details-enter')).toBe('');
  });
});
