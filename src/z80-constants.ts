// Minimal placeholder constants for z80-cpu integration.
// Cycle counts set to 0; parity bits precomputed for even parity.

export const cycle_counts = new Array<number>(256).fill(0);
export const cycle_counts_cb = new Array<number>(256).fill(0);
export const cycle_counts_dd = new Array<number>(256).fill(0);
export const cycle_counts_ed = new Array<number>(256).fill(0);

export const parity_bits: number[] = (() : number[] => {
  const arr = new Array<number>(256);
  for (let i = 0; i < 256; i++) {
    // even parity -> 1 if even number of set bits
    let x = i;
    let count = 0;
    while (x) {
      count += x & 1;
      x >>= 1;
    }
    arr[i] = count % 2 === 0 ? 1 : 0;
  }
  return arr;
})();
