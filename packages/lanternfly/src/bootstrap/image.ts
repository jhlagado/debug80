import { RUNTIME_ORIGIN, type TargetProfile } from "./runtime-image.js";

/**
 * The emitted-image contract.
 *
 * Review finding 27: `ownsResetVector` was a profile field nothing read, so
 * the output's shape was undecided — one contiguous image from zero, an image
 * from the origin plus a separate page-zero segment, or a host-loaded image
 * whose entry point is metadata. It is the first of those, and this module is
 * where that is settled and tested.
 *
 * An image is one contiguous run of bytes with one load address. Nothing is
 * emitted in two pieces, because a loader that has to place two pieces needs
 * a format to describe them, and the whole point of a `.COM`-shaped image is
 * that it has none.
 */

export const OP_JP = 0xc3;

/** Where the processor starts, on a profile that owns the reset vector. */
export const RESET_ADDRESS = 0x0000;

export interface EmittedImage {
  /** Load address of `bytes[0]`. */
  readonly loadAddress: number;
  readonly bytes: Uint8Array;
  /** Where execution begins once loaded. */
  readonly entryAddress: number;
  readonly profile: TargetProfile;
}

export interface ImageParts {
  /** The generated runtime, placed at the profile's origin. */
  readonly runtime: Uint8Array;
  /** Compiled program code, following the runtime. */
  readonly code: Uint8Array;
  /** The designated start, an address within the code. */
  readonly designatedStart: number;
}

/**
 * Builds the image a profile describes.
 *
 * On a profile that owns the reset vector the image begins at address zero
 * with a jump to the designated start, and page zero is filled to the origin.
 * Those filler bytes are the restart vectors and the NMI entry: a target that
 * uses them writes them there, and one that does not still cannot put code
 * there, because the processor jumps to those addresses whether or not the
 * program means anything by them.
 *
 * On a profile whose host owns the vectors the image begins at the origin and
 * carries no jump. The host launches the program at `entryAddress`.
 */
export const ADDRESS_SPACE = 0x10000;

export class ImageError extends Error {}

/**
 * Checks what the address space allows before an image is built.
 *
 * Review finding 31: the earlier check covered the runtime and left out the
 * code, so an image larger than the address space could be returned as a Z80
 * program, and any `designatedStart` was accepted — including one above
 * 65,535, which the two-byte JP operand silently truncated.
 */
function check(profile: TargetProfile, parts: ImageParts): void {
  const { runtime, code, designatedStart } = parts;

  const end = profile.origin + runtime.length + code.length;
  if (end > ADDRESS_SPACE) {
    throw new ImageError(
      `image does not fit: origin ${profile.origin} plus ${runtime.length} bytes of runtime ` +
        `and ${code.length} bytes of code ends at ${end}, past ${ADDRESS_SPACE}`,
    );
  }

  if (!Number.isInteger(designatedStart) || designatedStart < 0 || designatedStart >= ADDRESS_SPACE) {
    throw new ImageError(`designated start ${designatedStart} is not a sixteen-bit address`);
  }

  // `ImageParts` says the designated start is an address within the code, and
  // an entry jump that lands anywhere else runs bytes that are not a routine.
  const codeFrom = profile.origin + runtime.length;
  const codeTo = codeFrom + code.length;
  if (code.length === 0) {
    throw new ImageError("an image with no code has no designated start");
  }
  if (designatedStart < codeFrom || designatedStart >= codeTo) {
    throw new ImageError(
      `designated start ${designatedStart} is outside the code, which runs ${codeFrom}..${codeTo - 1}`,
    );
  }
}

export function buildImage(profile: TargetProfile, parts: ImageParts): EmittedImage {
  const { runtime, code, designatedStart } = parts;
  check(profile, parts);

  if (!profile.ownsResetVector) {
    const bytes = new Uint8Array(runtime.length + code.length);
    bytes.set(runtime, 0);
    bytes.set(code, runtime.length);
    return {
      loadAddress: profile.origin,
      bytes,
      entryAddress: designatedStart,
      profile,
    };
  }

  const bytes = new Uint8Array(profile.origin + runtime.length + code.length);
  bytes[0] = OP_JP;
  bytes[1] = designatedStart & 0xff;
  bytes[2] = (designatedStart >> 8) & 0xff;
  bytes.set(runtime, profile.origin);
  bytes.set(code, profile.origin + runtime.length);
  return {
    loadAddress: RESET_ADDRESS,
    bytes,
    entryAddress: RESET_ADDRESS,
    profile,
  };
}

/** Where program code begins, which is directly after the runtime. */
export function codeOrigin(profile: TargetProfile, runtimeBytes: number): number {
  return profile.origin + runtimeBytes;
}

/**
 * The addresses a Z80 jumps to on its own. Code may not occupy them, which is
 * the whole reason the origin is `$0100` rather than just past the entry jump.
 */
export const PROCESSOR_VECTORS = [
  0x0000, 0x0008, 0x0010, 0x0018, 0x0020, 0x0028, 0x0030, 0x0038, 0x0066,
] as const;

/** True when the profile's origin clears every address the processor uses. */
export function originClearsVectors(profile: TargetProfile): boolean {
  if (!profile.ownsResetVector) return true;
  return PROCESSOR_VECTORS.every(
    (vector) => vector === RESET_ADDRESS || vector < profile.origin,
  );
}

export { RUNTIME_ORIGIN };
