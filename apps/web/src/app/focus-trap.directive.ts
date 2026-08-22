import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  inject,
} from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

@Directive({ selector: '[appFocusTrap]' })
export class FocusTrapDirective implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngAfterViewInit(): void {
    queueMicrotask(() => this.focusable()[0]?.focus());
  }

  ngOnDestroy(): void {
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }

  @HostListener('keydown.tab', ['$event'])
  protected trap(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    const items = this.focusable();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const current = document.activeElement;
    const index = current instanceof HTMLElement ? items.indexOf(current) : -1;
    if (!keyboardEvent.shiftKey && index === items.length - 1) {
      keyboardEvent.preventDefault();
      items[0]?.focus();
    } else if (
      keyboardEvent.shiftKey &&
      (index <= 0 || !this.element.nativeElement.contains(current))
    ) {
      keyboardEvent.preventDefault();
      items.at(-1)?.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return [...this.element.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => !item.hasAttribute('disabled') && item.getClientRects().length > 0,
    );
  }
}
