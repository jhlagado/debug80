const ATOM_HOST_SINK_STATUS = Object.freeze({
  LIFECYCLE: 0xe0,
  BANK: 0xe1,
  IMAGE_ORDER: 0xe2,
  PATCH_TARGET: 0xe3,
  TARGET_RANGE: 0xe4,
});

const frozenBytes = (bytes: Uint8Array): readonly number[] =>
  Object.freeze(Array.from(bytes));

interface AtomGenerationSinkContext {
  readonly target: {
    readonly start: number;
    readonly capacity: number;
  };
  readonly descriptor?: unknown;
  readonly remaining: number;
  readonly finalCursor: number;
  readonly highWater: number;
}

interface AtomGenerationSinkOperation {
  readonly bank: number;
  readonly address: number;
  readonly bytes: Uint8Array;
  readonly source?: unknown;
}

export function createLegacyUnorderedMemoryAtomSink() {
  let open = false;
  let target: AtomGenerationSinkContext["target"] | undefined;
  let descriptor: unknown;
  let images: unknown[] = [];
  let patches: unknown[] = [];
  let imageAddresses = new Set<number>();
  let patchAddresses = new Set<number>();
  let generation: unknown;
  let failure: unknown;
  const lifecycle: string[] = [];

  const reject = (status: number, code: string, message: string): number => {
    failure = Object.freeze({ status, code, message });
    return status;
  };
  const inTarget = (address: number, length: number): boolean =>
    target !== undefined &&
    address >= target.start &&
    address + length <= target.start + target.capacity;

  return {
    begin(context: AtomGenerationSinkContext): number {
      lifecycle.push("begin");
      if (open) {
        return reject(
          ATOM_HOST_SINK_STATUS.LIFECYCLE,
          "generation-open",
          "a generation is already open",
        );
      }
      open = true;
      target = context.target;
      descriptor = context.descriptor;
      images = [];
      patches = [];
      imageAddresses = new Set();
      patchAddresses = new Set();
      generation = undefined;
      failure = undefined;
      return 0;
    },
    image(operation: AtomGenerationSinkOperation): number {
      lifecycle.push("image");
      if (!open) {
        return reject(
          ATOM_HOST_SINK_STATUS.LIFECYCLE,
          "generation-closed",
          "IMAGE requires an open generation",
        );
      }
      if (operation.bank !== 0) {
        return reject(
          ATOM_HOST_SINK_STATUS.BANK,
          "bank",
          "native Atom output is flat bank zero",
        );
      }
      if (!inTarget(operation.address, operation.bytes.length)) {
        return reject(
          ATOM_HOST_SINK_STATUS.TARGET_RANGE,
          "image-range",
          "IMAGE lies outside the target range",
        );
      }
      for (let offset = 0; offset < operation.bytes.length; offset += 1) {
        if (imageAddresses.has(operation.address + offset)) {
          return reject(
            ATOM_HOST_SINK_STATUS.IMAGE_ORDER,
            "image-overlap",
            "IMAGE records overlap",
          );
        }
      }
      const bytes = frozenBytes(operation.bytes);
      images.push(
        Object.freeze({
          bank: 0,
          address: operation.address,
          bytes,
          ...(operation.source === undefined
            ? {}
            : { source: operation.source }),
        }),
      );
      for (let offset = 0; offset < bytes.length; offset += 1) {
        imageAddresses.add(operation.address + offset);
      }
      return 0;
    },
    patch(operation: AtomGenerationSinkOperation): number {
      lifecycle.push("patch");
      if (!open) {
        return reject(
          ATOM_HOST_SINK_STATUS.LIFECYCLE,
          "generation-closed",
          "PATCH requires an open generation",
        );
      }
      if (operation.bank !== 0) {
        return reject(
          ATOM_HOST_SINK_STATUS.BANK,
          "bank",
          "native Atom output is flat bank zero",
        );
      }
      if (!inTarget(operation.address, operation.bytes.length)) {
        return reject(
          ATOM_HOST_SINK_STATUS.TARGET_RANGE,
          "patch-range",
          "PATCH lies outside the target range",
        );
      }
      for (let offset = 0; offset < operation.bytes.length; offset += 1) {
        const address = operation.address + offset;
        if (!imageAddresses.has(address) || patchAddresses.has(address)) {
          return reject(
            ATOM_HOST_SINK_STATUS.PATCH_TARGET,
            "patch-target",
            "PATCH does not name one unpatched IMAGE byte",
          );
        }
      }
      const bytes = frozenBytes(operation.bytes);
      patches.push(
        Object.freeze({
          bank: 0,
          address: operation.address,
          bytes,
          ...(operation.source === undefined
            ? {}
            : { source: operation.source }),
        }),
      );
      for (let offset = 0; offset < bytes.length; offset += 1) {
        patchAddresses.add(operation.address + offset);
      }
      return 0;
    },
    commit(context: AtomGenerationSinkContext): number {
      lifecycle.push("commit");
      if (!open) {
        return reject(
          ATOM_HOST_SINK_STATUS.LIFECYCLE,
          "generation-closed",
          "COMMIT requires an open generation",
        );
      }
      if (
        context.descriptor !== descriptor ||
        target === undefined ||
        context.remaining < 0 ||
        context.remaining > target.capacity
      ) {
        return reject(
          ATOM_HOST_SINK_STATUS.LIFECYCLE,
          "commit-state",
          "COMMIT state differs from the open generation",
        );
      }
      if (
        context.finalCursor < target.start ||
        context.finalCursor > target.start + target.capacity ||
        context.highWater < target.start ||
        context.highWater > target.start + target.capacity
      ) {
        return reject(
          ATOM_HOST_SINK_STATUS.TARGET_RANGE,
          "commit-range",
          "logical output extent lies outside the target range",
        );
      }
      generation = Object.freeze({
        target,
        finalCursor: context.finalCursor,
        highWater: context.highWater,
        remaining: context.remaining,
        images: Object.freeze([...images]),
        patches: Object.freeze([...patches]),
      });
      open = false;
      return 0;
    },
    abort(): number {
      lifecycle.push("abort");
      if (!open) {
        return reject(
          ATOM_HOST_SINK_STATUS.LIFECYCLE,
          "generation-closed",
          "ABORT requires an open generation",
        );
      }
      open = false;
      generation = undefined;
      return 0;
    },
    snapshot() {
      return Object.freeze({
        open,
        lifecycle: Object.freeze([...lifecycle]),
        generation,
        failure,
      });
    },
  };
}
