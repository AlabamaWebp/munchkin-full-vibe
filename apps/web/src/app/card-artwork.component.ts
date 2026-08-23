import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

function hashKey(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

@Component({
  selector: 'app-card-artwork',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="artwork"
      [class.compact]="compact()"
      aria-hidden="true"
      [attr.data-art-key]="artKey()"
      [style.--art-hue]="palette().hue"
      [style.--art-accent-hue]="palette().accentHue"
      [style.--art-angle]="palette().angle"
      [style.--art-shift]="palette().shift"
    >
      @if (imageUrl()) {
        <img
          class="card-image"
          [class.hidden]="failedImageUrl() === imageUrl()"
          [src]="imageUrl()"
          [alt]="label()"
          (error)="failedImageUrl.set(imageUrl())"
        />
      }
      <span class="orb orb-one" [class.hidden]="failedImageUrl() !== imageUrl()"></span>
      <span class="orb orb-two" [class.hidden]="failedImageUrl() !== imageUrl()"></span>
      <span class="glyph" [class.hidden]="failedImageUrl() !== imageUrl()">{{ glyph() }}</span>
      <small [class.hidden]="failedImageUrl() !== imageUrl()">{{ label() }}</small>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .artwork {
      position: relative;
      isolation: isolate;
      display: grid;
      height: 100%;
      min-height: 5.2rem;
      padding: 0.65rem;
      place-items: center;
      overflow: hidden;
      border: 1px solid hsl(var(--art-accent-hue) 24% 61% / 0.52);
      border-radius: 0.72rem;
      color: #f9fbfa;
      background: linear-gradient(
        var(--art-angle),
        hsl(var(--art-hue) 30% 31%),
        hsl(var(--art-accent-hue) 27% 19%)
      );
      box-shadow: inset 0 0 2rem rgba(3, 8, 5, 0.2);
    }
    .artwork::before,
    .artwork::after {
      position: absolute;
      z-index: -1;
      width: 5rem;
      height: 5rem;
      border: 1px solid rgba(255, 255, 255, 0.18);
      content: '';
      transform: rotate(var(--art-shift));
    }
    .artwork::before {
      top: -2.8rem;
      left: -1.4rem;
      border-radius: 35% 65% 58% 42%;
      background: hsl(var(--art-accent-hue) 38% 60% / 0.16);
    }
    .artwork::after {
      right: -2.2rem;
      bottom: -3.2rem;
      border-radius: 50%;
      background: hsl(var(--art-hue) 42% 68% / 0.12);
    }
    .orb {
      position: absolute;
      z-index: -1;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
    }
    .orb-one {
      top: 18%;
      right: 13%;
      width: 1.1rem;
      height: 1.1rem;
    }
    .orb-two {
      bottom: 18%;
      left: 18%;
      width: 0.45rem;
      height: 0.45rem;
    }
    .glyph {
      font-family: Georgia, serif;
      font-size: 1.65rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      line-height: 1;
      text-shadow: 0 0.12rem 0.35rem rgba(0, 0, 0, 0.42);
    }
    small {
      position: absolute;
      right: 0.45rem;
      bottom: 0.35rem;
      left: 0.45rem;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.76);
      font-size: 0.5rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-align: center;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .artwork.compact {
      min-height: 3rem;
      padding: 0.35rem;
    }
    .artwork.compact .glyph {
      font-size: 1rem;
    }
    .artwork.compact small {
      display: none;
    }
    .card-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      border-radius: 0.6rem;
    }
    .hidden {
      display: none;
    }
  `,
})
export class CardArtworkComponent {
  readonly artKey = input.required<string>();
  readonly label = input.required<string>();
  readonly compact = input(false);

  readonly failedImageUrl = signal<string | null>(null);

  readonly imageUrl = computed(() => {
    const lastDot = this.artKey().lastIndexOf('.');
    const fileName = lastDot === -1 ? this.artKey() : this.artKey().slice(lastDot + 1);
    return `/assets/cards/${fileName}.png`;
  });

  readonly palette = computed(() => {
    const hash = hashKey(this.artKey());
    const hue = hash % 360;
    return {
      hue,
      accentHue: (hue + 58 + ((hash >>> 9) % 64)) % 360,
      angle: `${118 + ((hash >>> 17) % 76)}deg`,
      shift: `${(hash % 38) - 19}deg`,
    };
  });

  readonly glyph = computed(() => {
    const parts = this.artKey()
      .split(/[.\-_]+/u)
      .filter(Boolean);
    const source = parts.at(-1) ?? this.artKey();
    const previous = parts.at(-2) ?? '';
    return `${source.at(0) ?? '•'}${previous.at(0) ?? source.at(1) ?? ''}`.toUpperCase();
  });
}
