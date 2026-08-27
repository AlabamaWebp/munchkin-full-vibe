import type { Page } from '@playwright/test';

export type UiIssueSeverity = 'error' | 'warning';

export interface UiIssue {
  readonly severity: UiIssueSeverity;
  readonly type: string;
  readonly selector: string;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export async function auditGeometry(page: Page): Promise<readonly UiIssue[]> {
  return page.evaluate(() => {
    type RectData = { x: number; y: number; width: number; height: number };
    type BrowserIssue = {
      severity: 'error' | 'warning';
      type: string;
      selector: string;
      message: string;
      data?: Record<string, unknown>;
    };

    const issues: BrowserIssue[] = [];
    const seen = new Set<string>();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const gameActive = document.documentElement.classList.contains('game-active');

    const rectData = (rect: DOMRect): RectData => ({
      x: Number(rect.x.toFixed(2)),
      y: Number(rect.y.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    });

    const outsideBy = (
      rect: DOMRect,
      bounds: { left: number; top: number; right: number; bottom: number },
    ): Record<'left' | 'top' | 'right' | 'bottom', number> => ({
      left: Number(Math.max(0, bounds.left - rect.left).toFixed(2)),
      top: Number(Math.max(0, bounds.top - rect.top).toFixed(2)),
      right: Number(Math.max(0, rect.right - bounds.right).toFixed(2)),
      bottom: Number(Math.max(0, rect.bottom - bounds.bottom).toFixed(2)),
    });

    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
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
          const sameTags = [...parent.children].filter(
            (child) => child.tagName === current!.tagName,
          );
          if (sameTags.length > 1) part += `:nth-of-type(${sameTags.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    };

    const addIssue = (
      severity: 'error' | 'warning',
      type: string,
      element: Element,
      message: string,
      data?: Record<string, unknown>,
    ): void => {
      const selector = selectorFor(element);
      const key = `${severity}|${type}|${selector}|${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      const parent = element.parentElement;
      issues.push({
        severity,
        type,
        selector,
        message,
        data: {
          invariant: type,
          geometry: {
            element: rectData(element.getBoundingClientRect()),
            parent:
              parent === null
                ? null
                : { selector: selectorFor(parent), rect: rectData(parent.getBoundingClientRect()) },
            viewport,
          },
          deviation: { unavailable: true },
          ...data,
        },
      });
    };

    const isRendered = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.01
      );
    };

    const isVisible = (element: Element): element is HTMLElement => {
      if (!isRendered(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const isHitTestable = (element: HTMLElement): boolean => {
      const rect = element.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left + rect.width / 2, 0), viewport.width - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 0), viewport.height - 1);
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === element || element.contains(hit));
    };

    const hasScrollableAncestor = (element: Element, axis: 'x' | 'y'): boolean => {
      let current = element.parentElement;
      while (current !== null && current !== document.body) {
        const style = getComputedStyle(current);
        const overflow = axis === 'x' ? style.overflowX : style.overflowY;
        const scrolls =
          axis === 'x'
            ? current.scrollWidth > current.clientWidth + 1
            : current.scrollHeight > current.clientHeight + 1;
        if (/(auto|scroll)/.test(overflow) && scrolls) return true;
        current = current.parentElement;
      }
      return false;
    };

    const textRangeRect = (element: Element): DOMRect | null => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      let node = walker.nextNode();
      while (node !== null) {
        if (node.textContent?.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(
            ...[...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0),
          );
        }
        node = walker.nextNode();
      }
      if (rects.length === 0) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return new DOMRect(left, top, right - left, bottom - top);
    };

    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const scrollHeight = Math.max(root.scrollHeight, body.scrollHeight);
    if (scrollWidth > viewport.width + 1) {
      addIssue('error', 'root-overflow-x', root, 'The page is wider than the viewport.', {
        viewportWidth: viewport.width,
        scrollWidth,
        deviation: { overflowX: Number((scrollWidth - viewport.width).toFixed(2)) },
      });
    }
    if (gameActive && scrollHeight > viewport.height + 1) {
      addIssue('error', 'root-overflow-y', root, 'The fixed game page scrolls vertically.', {
        viewportHeight: viewport.height,
        scrollHeight,
        deviation: { overflowY: Number((scrollHeight - viewport.height).toFixed(2)) },
      });
    }

    const gameShell = document.querySelector('.game-shell');
    if (gameShell instanceof HTMLElement && isVisible(gameShell)) {
      const rect = gameShell.getBoundingClientRect();
      const delta = {
        top: Math.abs(rect.top),
        bottom: Math.abs(viewport.height - rect.bottom),
      };
      if (
        Object.values(delta).some((value) => value > 1) ||
        rect.left < -1 ||
        rect.right > viewport.width + 1
      ) {
        addIssue(
          'error',
          'root-geometry',
          gameShell,
          'The fixed game root does not span 100dvh or exits the viewport.',
          {
            rect: rectData(rect),
            viewport,
            delta,
            deviation: delta,
          },
        );
      }
    }

    const interactiveSelector =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const interactiveElements = [...document.querySelectorAll(interactiveSelector)];
    const interactive = interactiveElements.filter(isVisible);
    const contracted = [
      ...document.querySelectorAll(
        '[data-ui-center], [data-ui-inside-parent], [data-ui-no-overlap]',
      ),
    ];
    const geometryCandidates = [
      ...new Set([...interactiveElements, ...contracted].filter(isRendered)),
    ];

    for (const element of geometryCandidates) {
      const rect = element.getBoundingClientRect();
      if (
        ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        addIssue(
          'error',
          'broken-geometry',
          element,
          'A visible audited element has invalid geometry.',
          {
            rect: rectData(rect),
            deviation: {
              invalidCoordinates: ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite),
              missingWidth: Number(Math.max(0, -rect.width).toFixed(2)),
              missingHeight: Number(Math.max(0, -rect.height).toFixed(2)),
              zeroWidth: rect.width === 0,
              zeroHeight: rect.height === 0,
            },
          },
        );
        continue;
      }

      const outsideX = rect.left < -1 || rect.right > viewport.width + 1;
      const outsideY = rect.top < -1 || rect.bottom > viewport.height + 1;
      if (outsideX && !hasScrollableAncestor(element, 'x')) {
        addIssue(
          'error',
          'outside-viewport-x',
          element,
          'An interactive element exits the viewport without an intentional horizontal scroller.',
          {
            rect: rectData(rect),
            viewport,
            deviation: outsideBy(rect, {
              left: 0,
              top: 0,
              right: viewport.width,
              bottom: viewport.height,
            }),
          },
        );
      }
      if (gameActive && outsideY && !hasScrollableAncestor(element, 'y')) {
        addIssue(
          'error',
          'outside-viewport-y',
          element,
          'An interactive element exits the fixed game viewport without an intentional vertical scroller.',
          {
            rect: rectData(rect),
            viewport,
            deviation: outsideBy(rect, {
              left: 0,
              top: 0,
              right: viewport.width,
              bottom: viewport.height,
            }),
          },
        );
      }

      if (element.hasAttribute('data-ui-inside-parent') && element.parentElement !== null) {
        const parentRect = element.parentElement.getBoundingClientRect();
        const tolerance = 1;
        if (
          rect.left < parentRect.left - tolerance ||
          rect.top < parentRect.top - tolerance ||
          rect.right > parentRect.right + tolerance ||
          rect.bottom > parentRect.bottom + tolerance
        ) {
          addIssue(
            'error',
            'outside-parent',
            element,
            'data-ui-inside-parent exits its parent box.',
            {
              rect: rectData(rect),
              parentRect: rectData(parentRect),
              deviation: outsideBy(rect, parentRect),
            },
          );
        }
      }
    }

    if (viewport.width <= 430) {
      for (const element of interactive) {
        if (
          element.matches(':disabled, [aria-disabled="true"]') ||
          !isHitTestable(element) ||
          (hasScrollableAncestor(element, 'x') && element.getBoundingClientRect().right <= 0)
        )
          continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < 44 - 0.5 || rect.height < 44 - 0.5) {
          addIssue(
            'error',
            'touch-target',
            element,
            'Mobile touch target is smaller than 44×44 CSS pixels.',
            {
              rect: rectData(rect),
              minimum: { width: 44, height: 44 },
              deviation: {
                widthShortfall: Number(Math.max(0, 44 - rect.width).toFixed(2)),
                heightShortfall: Number(Math.max(0, 44 - rect.height).toFixed(2)),
              },
            },
          );
        }
      }
    }

    for (const element of document.querySelectorAll<HTMLElement>('[data-ui-center]')) {
      if (!isVisible(element)) continue;
      const mode = element.dataset['uiCenter'];
      const parsedTolerance = Number(element.dataset['uiCenterTolerance'] ?? 4);
      const tolerance = Number.isFinite(parsedTolerance) ? parsedTolerance : 4;
      const elementRect = element.getBoundingClientRect();
      let measured: DOMRect | null = null;
      let target: DOMRect | null = null;
      if (mode === 'text') {
        measured = textRangeRect(element);
        target = elementRect;
      } else if (mode === 'parent' && element.parentElement !== null) {
        measured = elementRect;
        const parent = element.parentElement;
        const parentRect = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        const left = parentRect.left + Number.parseFloat(style.paddingLeft || '0');
        const top = parentRect.top + Number.parseFloat(style.paddingTop || '0');
        const right = parentRect.right - Number.parseFloat(style.paddingRight || '0');
        const bottom = parentRect.bottom - Number.parseFloat(style.paddingBottom || '0');
        target = new DOMRect(left, top, right - left, bottom - top);
      }
      if (measured === null || target === null) {
        addIssue(
          'error',
          'centering-contract',
          element,
          `Unsupported or unmeasurable data-ui-center="${mode ?? ''}" contract.`,
          { deviation: { reason: 'unsupported-or-unmeasurable' } },
        );
        continue;
      }
      const deltaX = Math.abs(
        measured.left + measured.width / 2 - (target.left + target.width / 2),
      );
      const deltaY = Math.abs(
        measured.top + measured.height / 2 - (target.top + target.height / 2),
      );
      if (deltaX > tolerance || deltaY > tolerance) {
        addIssue(
          'error',
          'miscentered',
          element,
          `${mode === 'text' ? 'Text range' : 'Element'} is not centered within tolerance.`,
          {
            mode,
            tolerance,
            deltaX: Number(deltaX.toFixed(2)),
            deltaY: Number(deltaY.toFixed(2)),
            measured: rectData(measured),
            target: rectData(target),
            deviation: {
              deltaX: Number(deltaX.toFixed(2)),
              deltaY: Number(deltaY.toFixed(2)),
              tolerance,
              excessX: Number(Math.max(0, deltaX - tolerance).toFixed(2)),
              excessY: Number(Math.max(0, deltaY - tolerance).toFixed(2)),
            },
          },
        );
      }
    }

    const noOverlap = [...document.querySelectorAll<HTMLElement>('[data-ui-no-overlap]')].filter(
      isVisible,
    );
    for (let leftIndex = 0; leftIndex < noOverlap.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < noOverlap.length; rightIndex += 1) {
        const left = noOverlap[leftIndex]!;
        const right = noOverlap[rightIndex]!;
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          addIssue(
            'error',
            'forbidden-overlap',
            left,
            `Overlaps ${selectorFor(right)} despite data-ui-no-overlap.`,
            {
              otherSelector: selectorFor(right),
              overlap: {
                width: Number(overlapWidth.toFixed(2)),
                height: Number(overlapHeight.toFixed(2)),
              },
              deviation: {
                overlapWidth: Number(overlapWidth.toFixed(2)),
                overlapHeight: Number(overlapHeight.toFixed(2)),
              },
            },
          );
        }
      }
    }

    for (const element of interactive) {
      if (!isHitTestable(element) || element.closest('[data-ui-allow-clip]')) continue;
      const ownStyle = getComputedStyle(element);
      const textRect = textRangeRect(element);
      const ownRect = element.getBoundingClientRect();
      const lineClamp = ownStyle.getPropertyValue('-webkit-line-clamp');
      const intentionalEllipsis =
        ownStyle.textOverflow === 'ellipsis' || (lineClamp !== '' && lineClamp !== 'none');
      if (
        textRect !== null &&
        /(hidden|clip)/.test(`${ownStyle.overflowX} ${ownStyle.overflowY}`) &&
        !intentionalEllipsis &&
        (textRect.top < ownRect.top - 1 || textRect.bottom > ownRect.bottom + 1)
      ) {
        addIssue(
          'warning',
          'text-clipping',
          element,
          'Rendered text range is vertically clipped by its interactive box.',
          {
            rect: rectData(ownRect),
            textRect: rectData(textRect),
            deviation: outsideBy(textRect, ownRect),
          },
        );
      }

      let ancestor = element.parentElement;
      let insideIntentionalScroller = false;
      while (ancestor !== null && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        if (
          (/(auto|scroll)/.test(style.overflowX) &&
            ancestor.scrollWidth > ancestor.clientWidth + 1) ||
          (/(auto|scroll)/.test(style.overflowY) &&
            ancestor.scrollHeight > ancestor.clientHeight + 1)
        ) {
          insideIntentionalScroller = true;
        }
        if (
          !insideIntentionalScroller &&
          /(hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)
        ) {
          const ancestorRect = ancestor.getBoundingClientRect();
          if (
            ownRect.left < ancestorRect.left - 2 ||
            ownRect.top < ancestorRect.top - 2 ||
            ownRect.right > ancestorRect.right + 2 ||
            ownRect.bottom > ancestorRect.bottom + 2
          ) {
            addIssue(
              'warning',
              'ancestor-clipping',
              element,
              `Interactive geometry is clipped by ${selectorFor(ancestor)}.`,
              {
                rect: rectData(ownRect),
                clippingAncestor: selectorFor(ancestor),
                ancestorRect: rectData(ancestorRect),
                deviation: outsideBy(ownRect, ancestorRect),
              },
            );
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
    }

    return issues;
  });
}
