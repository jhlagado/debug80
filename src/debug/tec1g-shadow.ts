export type RomRange = { start: number; end: number };

export type Tec1gShadowInfo = {
  hasLowRom: boolean;
  hasShadowRom: boolean;
  shadowCopied: boolean;
};

const covers = (ranges: RomRange[], start: number, end: number): boolean =>
  ranges.some((range) => range.start <= start && range.end >= end);

export const ensureTec1gShadowRom = (
  memory: Uint8Array,
  romRanges: RomRange[]
): Tec1gShadowInfo => {
  const hasLowRom = covers(romRanges, 0x0000, 0x07ff);
  const hasShadowRom = covers(romRanges, 0xc000, 0xc7ff);
  let shadowCopied = false;

  if (hasLowRom && !hasShadowRom) {
    memory.set(memory.subarray(0x0000, 0x0800), 0xc000);
    memory.fill(0x00, 0x0000, 0x0800);
    shadowCopied = true;
  }

  return { hasLowRom, hasShadowRom, shadowCopied };
};
