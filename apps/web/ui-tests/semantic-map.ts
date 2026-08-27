import type { Page } from '@playwright/test';

export interface SemanticUiMap {
  readonly version: 1;
  readonly title: string;
  readonly url: string;
  readonly accessibility: { readonly ariaSnapshot: string };
  readonly elements: readonly unknown[];
}

export async function createSemanticUiMap(page: Page): Promise<SemanticUiMap> {
  const ariaSnapshot = await page.locator('body').ariaSnapshot();
  const elements = await page.locator('body *').evaluateAll((nodes) => {
    const semanticSelector = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[role]',
      '[aria-label]',
      '[aria-labelledby]',
      'h1',
      'h2',
      'h3',
      'main',
      'nav',
      'section',
      'header',
      'footer',
      '[data-ui-center]',
      '[data-ui-inside-parent]',
      '[data-ui-no-overlap]',
    ].join(',');

    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return `${element.tagName.toLowerCase()}[aria-label="${ariaLabel.replaceAll('"', '\\"')}"]`;
      }
      const parts: string[] = [];
      let current: Element | null = element;
      while (current !== null && current !== document.documentElement && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        const className = [...current.classList].find((name) => !name.startsWith('ng-'));
        if (className) part += `.${CSS.escape(className)}`;
        const parent: Element | null = current.parentElement;
        if (parent !== null) {
          const siblings = [...parent.children].filter(
            (child) => child.tagName === current!.tagName,
          );
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    };

    const inferredRole = (element: Element): string | null => {
      const explicit = element.getAttribute('role');
      if (explicit) return explicit;
      const tag = element.tagName.toLowerCase();
      if (tag === 'button') return 'button';
      if (tag === 'a' && element.hasAttribute('href')) return 'link';
      if (tag === 'input')
        return (element.getAttribute('type') ?? 'text') === 'checkbox' ? 'checkbox' : 'textbox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'combobox';
      if (/^h[1-6]$/.test(tag)) return 'heading';
      return ['main', 'nav', 'section', 'header', 'footer'].includes(tag) ? tag : null;
    };

    return nodes.flatMap((node) => {
      if (!(node instanceof HTMLElement) || !node.matches(semanticSelector)) return [];
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) <= 0.01 ||
        rect.width <= 0 ||
        rect.height <= 0
      )
        return [];
      const labelledBy = node.getAttribute('aria-labelledby');
      const labelledText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
            .filter(Boolean)
            .join(' ')
        : '';
      const name =
        [
          node.getAttribute('aria-label') ?? '',
          labelledText,
          node instanceof HTMLInputElement ? node.value : '',
          node.innerText.trim().replace(/\s+/g, ' ').slice(0, 240),
        ].find(Boolean) ?? '';
      return [
        {
          selector: selectorFor(node),
          tag: node.tagName.toLowerCase(),
          role: inferredRole(node),
          name,
          box: {
            x: Number(rect.x.toFixed(2)),
            y: Number(rect.y.toFixed(2)),
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
          },
          state: {
            disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
            expanded: node.getAttribute('aria-expanded'),
            pressed: node.getAttribute('aria-pressed'),
            selected: node.getAttribute('aria-selected'),
          },
          contracts: {
            center: node.getAttribute('data-ui-center'),
            centerTolerance: node.getAttribute('data-ui-center-tolerance'),
            insideParent: node.hasAttribute('data-ui-inside-parent'),
            noOverlap: node.hasAttribute('data-ui-no-overlap'),
            dynamic: node.hasAttribute('data-ui-dynamic'),
            allowClip: node.hasAttribute('data-ui-allow-clip'),
          },
        },
      ];
    });
  });

  return {
    version: 1,
    title: await page.title(),
    url: page.url(),
    accessibility: { ariaSnapshot },
    elements,
  };
}
