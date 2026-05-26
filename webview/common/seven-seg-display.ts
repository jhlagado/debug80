/**
 * Shared 7-segment display: creates digit elements in a container and owns
 * the applyDigits update loop. Both TEC-1 and TEC-1G use the same structure.
 */

import { createDigit, updateDigit } from './digits';

export interface SevenSegDisplay {
  /** Individual digit elements (may be needed for direct DOM manipulation). */
  digitEls: HTMLElement[];
  /** Apply a bitmask array to all digits; out-of-range entries default to 0. */
  applyDigits(values: number[]): void;
}

export interface SevenSegDisplayOptions {
  digitClassName?: (index: number, count: number) => string | undefined;
}

export function createSevenSegDisplay(
  containerEl: HTMLElement,
  count: number,
  options: SevenSegDisplayOptions = {}
): SevenSegDisplay {
  const digitEls: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const digit = createDigit();
    const className = options.digitClassName?.(i, count);
    if (className !== undefined && className.trim().length > 0) {
      digit.classList.add(...className.trim().split(/\s+/));
    }
    digitEls.push(digit);
    containerEl.appendChild(digit);
  }

  return {
    digitEls,
    applyDigits(values: number[]): void {
      digitEls.forEach((el, idx) => {
        updateDigit(el, values[idx] ?? 0);
      });
    },
  };
}
