import { readFile } from "node:fs/promises";
import path from "node:path";

import type { NobjBegin, NobjMap, RuntimeLinkContext } from "./nobj.js";

export const NUCLEUS_TARGET_PUBLICATION_SCHEMA =
  "nucleus-target-publication/v1";

export interface NucleusTargetPublicationDescriptor {
  readonly begin: NobjBegin;
  readonly map: NobjMap;
  readonly runtimeLinkContext?: RuntimeLinkContext;
}

export interface NucleusTargetPublicationDescriptorFile
  extends NucleusTargetPublicationDescriptor {
  readonly schema: typeof NUCLEUS_TARGET_PUBLICATION_SCHEMA;
}

const requireInteger = (
  name: string,
  value: number,
  maximum: number,
): void => {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} is outside 0..${maximum}`);
  }
};

const requireU8 = (name: string, value: number): void =>
  requireInteger(name, value, 0xff);

const requireU16 = (name: string, value: number): void =>
  requireInteger(name, value, 0xffff);

const requireCapacity = (name: string, base: number, length: number): void => {
  requireU16(`${name} base`, base);
  requireU16(`${name} length`, length);
  if (base + length > 0x10000) {
    throw new RangeError(`${name} crosses the Z80 address space`);
  }
};

const cloneBegin = (begin: NobjBegin): NobjBegin =>
  Object.freeze({ ...begin });

const cloneMap = (map: NobjMap): NobjMap =>
  Object.freeze({
    ...map,
    partBanks: Object.freeze([...map.partBanks]),
    banks: Object.freeze(map.banks.map((bank) => Object.freeze({ ...bank }))),
  });

const cloneRuntimeLinkContext = (
  context: RuntimeLinkContext,
): RuntimeLinkContext =>
  Object.freeze({
    ...context,
    services: Object.freeze({ ...context.services }),
  });

export function defineNucleusTargetPublicationDescriptor(
  descriptor: NucleusTargetPublicationDescriptor,
): NucleusTargetPublicationDescriptor {
  validateNucleusTargetPublicationDescriptor(descriptor);
  return Object.freeze({
    begin: cloneBegin(descriptor.begin),
    map: cloneMap(descriptor.map),
    ...(descriptor.runtimeLinkContext === undefined
      ? {}
      : {
          runtimeLinkContext: cloneRuntimeLinkContext(
            descriptor.runtimeLinkContext,
          ),
        }),
  });
}

export function validateNucleusTargetPublicationDescriptor(
  descriptor: NucleusTargetPublicationDescriptor,
): void {
  requireU16("runtime identity", descriptor.begin.runtimeIdentity);
  requireU8("bank count", descriptor.begin.bankCount);
  if (descriptor.begin.bankCount === 0) {
    throw new RangeError("bank count must be nonzero");
  }
  requireU8("image fill", descriptor.begin.imageFill);
  requireCapacity(
    "image",
    descriptor.begin.imageBase,
    descriptor.begin.imageCapacity,
  );

  requireU8("entry bank", descriptor.map.entryBank);
  if (descriptor.map.entryBank >= descriptor.begin.bankCount) {
    throw new RangeError("entry bank is outside the target bank count");
  }
  requireU16("entry address", descriptor.map.entryAddress);
  requireCapacity(
    "writable region",
    descriptor.map.writableBase,
    descriptor.map.writableCapacity,
  );
  requireCapacity(
    "runtime vector",
    descriptor.map.vectorBase,
    descriptor.map.vectorLength,
  );
  requireCapacity(
    "initialized run region",
    descriptor.map.initializedRunBase,
    descriptor.map.initializedRunLength,
  );
  requireCapacity("bss region", descriptor.map.bssBase, descriptor.map.bssLength);
  requireU16("stack requirement", descriptor.map.stackRequirement);
  requireU8("data load bank", descriptor.map.dataLoadBank);
  if (descriptor.map.dataLoadBank >= descriptor.begin.bankCount) {
    throw new RangeError("data load bank is outside the target bank count");
  }
  requireCapacity(
    "data load region",
    descriptor.map.dataLoadAddress,
    descriptor.map.dataLoadLength,
  );
  if (descriptor.map.banks.length !== descriptor.begin.bankCount) {
    throw new RangeError("target bank map count does not match bank count");
  }
  for (const [index, bank] of descriptor.map.banks.entries()) {
    requireU16(`bank ${index} used length`, bank.usedLength);
    requireCapacity(
      `bank ${index} read-only region`,
      bank.readOnlyBase,
      bank.readOnlyLength,
    );
    requireCapacity(
      `bank ${index} aggregate constant region`,
      bank.aggregateConstantBase,
      bank.aggregateConstantLength,
    );
  }

  const context = descriptor.runtimeLinkContext;
  if (context === undefined) return;
  requireCapacity("runtime code", context.runtimeBase, 1);
  requireCapacity(
    "runtime writable region",
    context.writableBase,
    context.writableCapacity,
  );
  requireU16("runtime writable state base", context.writableStateBase);
  requireU16("runtime vector base", context.vectorBase);
  requireCapacity(
    "runtime program data region",
    context.programDataBase,
    context.programDataCapacity,
  );
  requireCapacity(
    "runtime read-only region",
    context.readOnlyBase,
    context.readOnlyCapacity,
  );
  for (const [name, address] of Object.entries(context.services)) {
    requireU16(`runtime service ${name}`, address);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function loadNucleusTargetPublicationDescriptor(
  file: string,
): Promise<NucleusTargetPublicationDescriptor> {
  const descriptorPath = path.resolve(file);
  const parsed = JSON.parse(
    await readFile(descriptorPath, "utf8"),
  ) as unknown;
  if (!isObject(parsed)) {
    throw new TypeError("target descriptor file must contain a JSON object");
  }
  if (parsed.schema !== NUCLEUS_TARGET_PUBLICATION_SCHEMA) {
    throw new TypeError(
      `target descriptor schema must be ${NUCLEUS_TARGET_PUBLICATION_SCHEMA}`,
    );
  }
  if (!isObject(parsed.begin)) {
    throw new TypeError("target descriptor begin must be an object");
  }
  if (!isObject(parsed.map)) {
    throw new TypeError("target descriptor map must be an object");
  }
  if (
    parsed.runtimeLinkContext !== undefined &&
    !isObject(parsed.runtimeLinkContext)
  ) {
    throw new TypeError(
      "target descriptor runtimeLinkContext must be an object",
    );
  }
  return defineNucleusTargetPublicationDescriptor({
    begin: parsed.begin as unknown as NobjBegin,
    map: parsed.map as unknown as NobjMap,
    ...(parsed.runtimeLinkContext === undefined
      ? {}
      : {
          runtimeLinkContext:
            parsed.runtimeLinkContext as unknown as RuntimeLinkContext,
        }),
  });
}
