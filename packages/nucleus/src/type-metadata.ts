/**
 * Compact compiler metadata for the complete Nucleus 0.1 type grammar.
 *
 * This is compiler-side metadata, not a generated-program runtime tag. The tag folds an
 * array's element family into the outer kind, which keeps every admitted type
 * in four bytes without excluding arrays of records or bounded strings.
 */

export const TYPE_DESCRIPTOR_SIZE = 4;

export const TypeTag = {
  u8: 0,
  u16: 1,
  boolean: 2,
  record: 3,
  string: 4,
  arrayU8: 5,
  arrayU16: 6,
  arrayBoolean: 7,
  arrayRecord: 8,
  arrayString: 9,
} as const;

export type ScalarName = "u8" | "u16" | "boolean";
export type ScalarType =
  | { readonly kind: "u8" }
  | { readonly kind: "u16" }
  | { readonly kind: "boolean" };

export type NucleusType =
  | ScalarType
  | { readonly kind: "record"; readonly id: number }
  | { readonly kind: "string"; readonly capacity: number }
  | {
      readonly kind: "array";
      readonly length: number;
      readonly element:
        | ScalarType
        | { readonly kind: "record"; readonly id: number }
        | { readonly kind: "string"; readonly capacity: number };
    };

export type TypeDescriptor = Readonly<Uint8Array>;

export function encodeType(type: NucleusType): TypeDescriptor {
  const bytes = new Uint8Array(TYPE_DESCRIPTOR_SIZE);
  if (type.kind === "u8") bytes[0] = TypeTag.u8;
  else if (type.kind === "u16") bytes[0] = TypeTag.u16;
  else if (type.kind === "boolean") bytes[0] = TypeTag.boolean;
  else if (type.kind === "record") {
    bytes[0] = TypeTag.record;
    bytes[1] = byte(type.id, "record id");
  } else if (type.kind === "string") {
    bytes[0] = TypeTag.string;
    bytes[1] = capacity(type.capacity);
  } else {
    const element = type.element;
    if (element.kind === "u8") bytes[0] = TypeTag.arrayU8;
    else if (element.kind === "u16") bytes[0] = TypeTag.arrayU16;
    else if (element.kind === "boolean") bytes[0] = TypeTag.arrayBoolean;
    else if (element.kind === "record") {
      bytes[0] = TypeTag.arrayRecord;
      bytes[1] = byte(element.id, "record id");
    } else {
      bytes[0] = TypeTag.arrayString;
      bytes[1] = capacity(element.capacity);
    }
    const length = positiveWord(type.length, "array length");
    bytes[2] = length & 0xff;
    bytes[3] = length >>> 8;
  }
  return bytes;
}

export function sameType(left: TypeDescriptor, right: TypeDescriptor): boolean {
  requireDescriptor(left);
  requireDescriptor(right);
  for (let index = 0; index < TYPE_DESCRIPTOR_SIZE; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Compare retained metadata bytes only. The report deliberately excludes the
 * code for allocation and lookup, which must be measured in the real compiler.
 */
export function metadataStorageReport(types: readonly NucleusType[]): {
  readonly symbols: number;
  readonly uniqueTypes: number;
  readonly inlineBytes: number;
  readonly internedBytes: number;
} {
  const encoded = types.map(encodeType);
  const uniqueTypes = new Set(encoded.map(descriptorKey)).size;
  return {
    symbols: types.length,
    uniqueTypes,
    inlineBytes: types.length * TYPE_DESCRIPTOR_SIZE,
    internedBytes: types.length + uniqueTypes * TYPE_DESCRIPTOR_SIZE,
  };
}

function descriptorKey(descriptor: TypeDescriptor): string {
  return Array.from(descriptor).join(":");
}

function requireDescriptor(descriptor: TypeDescriptor): void {
  if (descriptor.length !== TYPE_DESCRIPTOR_SIZE) {
    throw new Error(
      `type descriptor must contain ${TYPE_DESCRIPTOR_SIZE} bytes`,
    );
  }
}

function capacity(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 0xff) {
    throw new Error("string capacity must lie in 1..255");
  }
  return value;
}

function byte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must lie in 0..255`);
  }
  return value;
}

function positiveWord(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 0xffff) {
    throw new Error(`${label} must lie in 1..65,535`);
  }
  return value;
}
