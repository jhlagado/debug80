/** Strict Nucleus Object Stream Format 0.1 encoding and materialization. */

export const NobjKind = {
  begin: 0x01,
  image: 0x02,
  patch: 0x03,
  map: 0x04,
  commit: 0x05,
} as const;

export const NOBJ_MAJOR_VERSION = 0;
export const NOBJ_MINOR_VERSION = 1;
export const NOBJ_MAP_REVISION = 1;
export const NOBJ_MAX_RECORDS = 0xffff;
export const NOBJ_MAX_DATA_BYTES = 0xfffc;

export interface NobjBegin {
  readonly banked: boolean;
  readonly runtimeIdentity: number;
  readonly bankCount: number;
  readonly imageFill: number;
  readonly imageBase: number;
  readonly imageCapacity: number;
}

export interface NobjImageRecord {
  readonly bank: number;
  readonly address: number;
  readonly bytes: Uint8Array;
}

export interface NobjBankMap {
  readonly usedLength: number;
  readonly readOnlyBase: number;
  readonly readOnlyLength: number;
  readonly aggregateConstantBase: number;
  readonly aggregateConstantLength: number;
}

export interface NobjMap {
  readonly romMode: boolean;
  readonly establishedStack: boolean;
  readonly entryBank: number;
  readonly entryAddress: number;
  readonly writableBase: number;
  readonly writableCapacity: number;
  readonly vectorBase: number;
  readonly vectorLength: number;
  readonly initializedRunBase: number;
  readonly initializedRunLength: number;
  readonly bssBase: number;
  readonly bssLength: number;
  readonly stackRequirement: number;
  readonly dataLoadBank: number;
  readonly dataLoadAddress: number;
  readonly dataLoadLength: number;
  readonly partBanks: readonly number[];
  readonly banks: readonly NobjBankMap[];
}

export interface NobjCommit {
  readonly recordCount: number;
  readonly entryBank: number;
  readonly entryAddress: number;
  readonly crc16: number;
}

export interface ParsedNobj {
  readonly serialized: Uint8Array;
  readonly begin: NobjBegin;
  readonly images: readonly NobjImageRecord[];
  readonly patches: readonly NobjImageRecord[];
  readonly map: NobjMap;
  readonly commit: NobjCommit;
}

export interface MaterializedNobj {
  readonly parsed: ParsedNobj;
  readonly banks: readonly Uint8Array[];
  readonly flatImage?: Uint8Array;
}

export interface RuntimeImage {
  readonly identity: number;
  readonly bytes: Uint8Array;
  readonly initialBytes: Uint8Array;
  readonly vectorBytes: Uint8Array;
  readonly helperOffsets?: Readonly<Record<string, number>>;
}

export interface RuntimeServiceAddresses {
  readonly readInputByte: number;
  readonly writeOutputByte: number;
  readonly readStorageByte: number;
  readonly rewindStorageInput: number;
  readonly writeStorageByte: number;
  readonly seekStorageOutput: number;
  readonly success: number;
  readonly unhandledFailure: number;
  readonly trap: number;
  readonly farCall: number;
  readonly farJump: number;
}

export interface RuntimeLinkContext {
  readonly runtimeBase: number;
  readonly writableBase: number;
  readonly writableCapacity: number;
  readonly writableStateBase: number;
  readonly vectorBase: number;
  readonly programDataBase: number;
  readonly programDataCapacity: number;
  readonly readOnlyBase: number;
  readonly readOnlyCapacity: number;
  readonly services: RuntimeServiceAddresses;
}

export interface RuntimeImageProvider {
  get(identity: number, context: RuntimeLinkContext): RuntimeImage | undefined;
}

/** Sequential storage used independently for image and patch records. */
export interface NobjSpool {
  readonly byteLength: number;
  append(bytes: Uint8Array): void;
  chunks(): Iterable<Uint8Array>;
  clear(): void;
}

export type NobjSpoolFactory = () => NobjSpool;

export class MemoryNobjSpool implements NobjSpool {
  readonly #chunks: Uint8Array[] = [];
  #byteLength = 0;

  get byteLength(): number {
    return this.#byteLength;
  }

  append(bytes: Uint8Array): void {
    const retained = bytes.slice();
    this.#chunks.push(retained);
    this.#byteLength += retained.length;
  }

  *chunks(): Iterable<Uint8Array> {
    for (const chunk of this.#chunks) yield chunk.slice();
  }

  clear(): void {
    this.#chunks.length = 0;
    this.#byteLength = 0;
  }
}

export class NobjError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NobjError";
  }
}

/** Atomic reference to the most recently validated committed generation. */
export class NobjGenerationStore {
  #current: Uint8Array | undefined;

  get current(): Uint8Array | undefined {
    return this.#current?.slice();
  }

  publish(serialized: Uint8Array): ParsedNobj {
    const parsed = parseNobj(serialized);
    this.#current = serialized.slice();
    return parsed;
  }
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

interface DecodedRecord {
  readonly kind: number;
  readonly start: number;
  readonly payloadStart: number;
  readonly payloadEnd: number;
}

const fail = (message: string): never => {
  throw new NobjError(message);
};

const requireInteger = (name: string, value: number, maximum: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    fail(`${name} is outside 0..${maximum}`);
  }
};

const requireU8 = (name: string, value: number): void =>
  requireInteger(name, value, 0xff);
const requireU16 = (name: string, value: number): void =>
  requireInteger(name, value, 0xffff);

const checkedEnd = (name: string, base: number, length: number): number => {
  requireU16(`${name} base`, base);
  requireU16(`${name} length`, length);
  const end = base + length;
  if (end > 0x10000) fail(`${name} wraps the Z80 address space`);
  return end;
};

const requireRegion = (
  name: string,
  address: number,
  length: number,
  base: number,
  capacity: number,
): number => {
  const regionEnd = checkedEnd(`${name} region`, base, capacity);
  const end = checkedEnd(name, address, length);
  if (address < base || end > regionEnd)
    fail(`${name} is outside its image region`);
  return end;
};

const appendU16 = (bytes: number[], value: number): void => {
  requireU16("u16 field", value);
  bytes.push(value & 0xff, value >>> 8);
};

const readU16 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);

const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
};

const record = (kind: number, payload: Uint8Array): Uint8Array => {
  if (payload.length > 0xffff) fail("record payload exceeds 65,535 bytes");
  const result = new Uint8Array(payload.length + 3);
  result[0] = kind;
  result[1] = payload.length & 0xff;
  result[2] = payload.length >>> 8;
  result.set(payload, 3);
  return result;
};

const encodeBegin = (begin: NobjBegin): Uint8Array => {
  validateBegin(begin);
  const payload: number[] = [
    0x4e,
    0x4f,
    0x42,
    0x4a,
    NOBJ_MAJOR_VERSION,
    NOBJ_MINOR_VERSION,
    begin.banked ? 1 : 0,
  ];
  appendU16(payload, begin.runtimeIdentity);
  payload.push(begin.bankCount, begin.imageFill);
  appendU16(payload, begin.imageBase);
  appendU16(payload, begin.imageCapacity);
  return record(NobjKind.begin, Uint8Array.from(payload));
};

const encodeImageLike = (
  kind: typeof NobjKind.image | typeof NobjKind.patch,
  value: NobjImageRecord,
): Uint8Array => {
  if (value.bytes.length < 1 || value.bytes.length > NOBJ_MAX_DATA_BYTES) {
    fail("IMAGE/PATCH byte count is outside 1..65,532");
  }
  requireU8("record bank", value.bank);
  requireU16("record address", value.address);
  const payload = new Uint8Array(value.bytes.length + 3);
  payload[0] = value.bank;
  payload[1] = value.address & 0xff;
  payload[2] = value.address >>> 8;
  payload.set(value.bytes, 3);
  return record(kind, payload);
};

const encodeMap = (map: NobjMap): Uint8Array => {
  requireU8("MAP entry bank", map.entryBank);
  requireU8("MAP data-load bank", map.dataLoadBank);
  for (const bank of map.partBanks) requireU8("MAP source-part bank", bank);
  const payload: number[] = [
    NOBJ_MAP_REVISION,
    (map.romMode ? 1 : 0) | (map.establishedStack ? 2 : 0),
    map.entryBank,
  ];
  appendU16(payload, map.entryAddress);
  appendU16(payload, map.writableBase);
  appendU16(payload, map.writableCapacity);
  appendU16(payload, map.vectorBase);
  appendU16(payload, map.vectorLength);
  appendU16(payload, map.initializedRunBase);
  appendU16(payload, map.initializedRunLength);
  appendU16(payload, map.bssBase);
  appendU16(payload, map.bssLength);
  appendU16(payload, map.stackRequirement);
  payload.push(map.dataLoadBank);
  appendU16(payload, map.dataLoadAddress);
  appendU16(payload, map.dataLoadLength);
  if (map.partBanks.length < 1 || map.partBanks.length > 0xff) {
    fail("MAP part count is outside 1..255");
  }
  payload.push(map.partBanks.length, ...map.partBanks);
  if (map.banks.length < 1 || map.banks.length > 0xff) {
    fail("MAP bank-entry count is outside 1..255");
  }
  payload.push(map.banks.length);
  for (const bank of map.banks) {
    appendU16(payload, bank.usedLength);
    appendU16(payload, bank.readOnlyBase);
    appendU16(payload, bank.readOnlyLength);
    appendU16(payload, bank.aggregateConstantBase);
    appendU16(payload, bank.aggregateConstantLength);
  }
  return record(NobjKind.map, Uint8Array.from(payload));
};

const validateBegin = (begin: NobjBegin): void => {
  requireU16("runtime identity", begin.runtimeIdentity);
  requireU8("bank count", begin.bankCount);
  requireU8("image fill", begin.imageFill);
  requireU16("image base", begin.imageBase);
  requireU16("image capacity", begin.imageCapacity);
  if (begin.imageCapacity === 0) fail("image capacity must be nonzero");
  checkedEnd("image region", begin.imageBase, begin.imageCapacity);
  if (begin.banked) {
    if (begin.bankCount < 2) fail("banked BEGIN requires at least two banks");
  } else if (begin.bankCount !== 1) {
    fail("flat BEGIN requires exactly one bank");
  }
};

export const crc16CcittFalse = (bytes: Uint8Array): number => {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) === 0
          ? (crc << 1) & 0xffff
          : ((crc << 1) ^ 0x1021) & 0xffff;
    }
  }
  return crc;
};

export class NobjGenerationSink {
  readonly #store: NobjGenerationStore;
  readonly #provider: RuntimeImageProvider;
  readonly #spoolFactory: NobjSpoolFactory;
  #imageSpool: NobjSpool;
  #patchSpool: NobjSpool;
  #begin: NobjBegin | undefined;
  #map: NobjMap | undefined;
  #imageCount = 0;
  #patchCount = 0;
  #imageHighWater = 0;
  #patchHighWater = 0;
  readonly #imageEnds = new Map<number, number>();
  readonly #patchIntervals = new Map<number, Interval[]>();

  constructor(
    store: NobjGenerationStore,
    provider: RuntimeImageProvider,
    spoolFactory: NobjSpoolFactory = () => new MemoryNobjSpool(),
  ) {
    this.#store = store;
    this.#provider = provider;
    this.#spoolFactory = spoolFactory;
    this.#imageSpool = spoolFactory();
    this.#patchSpool = spoolFactory();
  }

  get imageSpoolHighWater(): number {
    return this.#imageHighWater;
  }

  get patchSpoolHighWater(): number {
    return this.#patchHighWater;
  }

  begin(begin: NobjBegin): void {
    if (this.#begin !== undefined) fail("a generation is already active");
    validateBegin(begin);
    this.#resetTentative();
    this.#begin = { ...begin };
  }

  image(bank: number, address: number, bytes: Uint8Array): void {
    const begin = this.#requireOpen();
    this.#requireBeforeMap();
    this.#requireDataRecordCapacity(1);
    this.#validateImage(begin, bank, address, bytes);
    this.#imageSpool.append(
      encodeImageLike(NobjKind.image, { bank, address, bytes }),
    );
    this.#imageCount += 1;
    this.#imageEnds.set(bank, address + bytes.length);
    this.#imageHighWater = Math.max(
      this.#imageHighWater,
      this.#imageSpool.byteLength,
    );
  }

  runtimeImage(
    bank: number,
    address: number,
    identity: number,
    context: RuntimeLinkContext,
    expectedLength: number,
  ): void {
    const begin = this.#requireOpen();
    this.#requireBeforeMap();
    requireU16("runtime identity", identity);
    requireU16("runtime expected length", expectedLength);
    if (identity !== begin.runtimeIdentity)
      fail("runtime identity differs from BEGIN");
    if (context.runtimeBase !== address) {
      fail("runtime link context base differs from IMAGE address");
    }
    const runtime = this.#provider.get(identity, context);
    if (runtime === undefined) fail("runtime identity is unavailable");
    const selectedRuntime = runtime as RuntimeImage;
    if (selectedRuntime.identity !== identity) {
      fail("runtime provider returned the wrong identity");
    }
    if (selectedRuntime.bytes.length !== expectedLength) {
      fail("runtime provider length mismatch");
    }
    if (expectedLength === 0) fail("runtime image must be nonempty");

    // Preflight the complete operation so a failed provider call appends no prefix.
    this.#validateImageExtent(
      begin,
      bank,
      address,
      selectedRuntime.bytes.length,
      "runtime IMAGE",
    );
    this.#requireDataRecordCapacity(
      Math.ceil(selectedRuntime.bytes.length / NOBJ_MAX_DATA_BYTES),
    );
    let offset = 0;
    while (offset < selectedRuntime.bytes.length) {
      const length = Math.min(
        NOBJ_MAX_DATA_BYTES,
        selectedRuntime.bytes.length - offset,
      );
      const bytes = selectedRuntime.bytes.slice(offset, offset + length);
      this.#imageSpool.append(
        encodeImageLike(NobjKind.image, {
          bank,
          address: address + offset,
          bytes,
        }),
      );
      this.#imageCount += 1;
      offset += length;
    }
    this.#imageEnds.set(bank, address + selectedRuntime.bytes.length);
    this.#imageHighWater = Math.max(
      this.#imageHighWater,
      this.#imageSpool.byteLength,
    );
  }

  runtimeInitialImage(
    bank: number,
    address: number,
    identity: number,
    context: RuntimeLinkContext,
    expectedLength: number,
  ): void {
    const begin = this.#requireOpen();
    this.#requireBeforeMap();
    requireU16("runtime identity", identity);
    requireU16("runtime initial-image expected length", expectedLength);
    if (identity !== begin.runtimeIdentity)
      fail("runtime identity differs from BEGIN");
    const runtime = this.#provider.get(identity, context);
    if (runtime === undefined) fail("runtime identity is unavailable");
    const selectedRuntime = runtime as RuntimeImage;
    if (selectedRuntime.identity !== identity) {
      fail("runtime provider returned the wrong identity");
    }
    if (selectedRuntime.initialBytes.length !== expectedLength) {
      fail("runtime provider initial-image length mismatch");
    }
    if (expectedLength === 0) fail("runtime initial image must be nonempty");

    this.#validateImageExtent(
      begin,
      bank,
      address,
      selectedRuntime.initialBytes.length,
      "runtime initial IMAGE",
    );
    this.#requireDataRecordCapacity(
      Math.ceil(selectedRuntime.initialBytes.length / NOBJ_MAX_DATA_BYTES),
    );
    let offset = 0;
    while (offset < selectedRuntime.initialBytes.length) {
      const length = Math.min(
        NOBJ_MAX_DATA_BYTES,
        selectedRuntime.initialBytes.length - offset,
      );
      const bytes = selectedRuntime.initialBytes.slice(offset, offset + length);
      this.#imageSpool.append(
        encodeImageLike(NobjKind.image, {
          bank,
          address: address + offset,
          bytes,
        }),
      );
      this.#imageCount += 1;
      offset += length;
    }
    this.#imageEnds.set(bank, address + selectedRuntime.initialBytes.length);
    this.#imageHighWater = Math.max(
      this.#imageHighWater,
      this.#imageSpool.byteLength,
    );
  }

  patch(bank: number, address: number, bytes: Uint8Array): void {
    const begin = this.#requireOpen();
    this.#requireBeforeMap();
    this.#requireDataRecordCapacity(1);
    this.#validatePatch(begin, bank, address, bytes);
    this.#patchSpool.append(
      encodeImageLike(NobjKind.patch, { bank, address, bytes }),
    );
    this.#patchCount += 1;
    const intervals = this.#patchIntervals.get(bank) ?? [];
    intervals.push({ start: address, end: address + bytes.length });
    this.#patchIntervals.set(bank, intervals);
    this.#patchHighWater = Math.max(
      this.#patchHighWater,
      this.#patchSpool.byteLength,
    );
  }

  map(map: NobjMap): void {
    this.#requireOpen();
    if (this.#map !== undefined) fail("MAP was already submitted");
    this.#map = cloneMap(map);
  }

  commit(): Uint8Array {
    const begin = this.#requireOpen();
    const map = this.#map;
    if (map === undefined) fail("MAP is required before COMMIT");
    const committedMap = map as NobjMap;
    if (this.#imageCount === 0) fail("at least one IMAGE record is required");
    const recordCount = 1 + this.#imageCount + this.#patchCount + 1 + 1;
    if (recordCount > NOBJ_MAX_RECORDS)
      fail("NOBJ record count exceeds 65,535");

    const prefix = [
      encodeBegin(begin),
      ...this.#imageSpool.chunks(),
      ...this.#patchSpool.chunks(),
      encodeMap(committedMap),
    ];
    const commitPrefix: number[] = [NobjKind.commit, 7, 0];
    appendU16(commitPrefix, recordCount);
    commitPrefix.push(committedMap.entryBank);
    appendU16(commitPrefix, committedMap.entryAddress);
    const covered = concat([...prefix, Uint8Array.from(commitPrefix)]);
    const crc = crc16CcittFalse(covered);
    const serialized = concat([
      covered,
      Uint8Array.from([crc & 0xff, crc >>> 8]),
    ]);

    // Validation happens before publication; a failed commit leaves the old generation selected.
    parseNobj(serialized);
    this.#store.publish(serialized);
    this.#begin = undefined;
    this.#map = undefined;
    this.#imageSpool.clear();
    this.#patchSpool.clear();
    return serialized;
  }

  abort(): void {
    this.#begin = undefined;
    this.#map = undefined;
    this.#resetTentative();
  }

  #requireOpen(): NobjBegin {
    if (this.#begin === undefined) fail("no NOBJ generation is active");
    return this.#begin as NobjBegin;
  }

  #requireBeforeMap(): void {
    if (this.#map !== undefined)
      fail("image and patch output is closed after MAP");
  }

  #requireDataRecordCapacity(additional: number): void {
    const dataRecordLimit = NOBJ_MAX_RECORDS - 3;
    if (this.#imageCount + this.#patchCount + additional > dataRecordLimit) {
      fail("NOBJ record count exceeds 65,535");
    }
  }

  #validateImage(
    begin: NobjBegin,
    bank: number,
    address: number,
    bytes: Uint8Array,
  ): void {
    if (bytes.length < 1 || bytes.length > NOBJ_MAX_DATA_BYTES) {
      fail("IMAGE byte count is outside 1..65,532");
    }
    this.#validateImageExtent(begin, bank, address, bytes.length, "IMAGE");
  }

  #validateImageExtent(
    begin: NobjBegin,
    bank: number,
    address: number,
    length: number,
    name: string,
  ): void {
    if (length < 1 || length > 0xffff) {
      fail(`${name} byte count is outside 1..65,535`);
    }
    requireU8(`${name} bank`, bank);
    if (bank >= begin.bankCount)
      fail(`${name} bank is outside BEGIN.bankCount`);
    const end = requireRegion(
      name,
      address,
      length,
      begin.imageBase,
      begin.imageCapacity,
    );
    const previousEnd = this.#imageEnds.get(bank);
    if (previousEnd !== undefined && address < previousEnd) {
      fail("IMAGE records descend or overlap within a bank");
    }
    if (end > 0x10000) fail(`${name} crosses the Z80 address space`);
  }

  #validatePatch(
    begin: NobjBegin,
    bank: number,
    address: number,
    bytes: Uint8Array,
  ): void {
    if (bytes.length < 1 || bytes.length > NOBJ_MAX_DATA_BYTES) {
      fail("PATCH byte count is outside 1..65,532");
    }
    requireU8("PATCH bank", bank);
    if (bank >= begin.bankCount) fail("PATCH bank is outside BEGIN.bankCount");
    const end = requireRegion(
      "PATCH",
      address,
      bytes.length,
      begin.imageBase,
      begin.imageCapacity,
    );
    for (const interval of this.#patchIntervals.get(bank) ?? []) {
      if (address < interval.end && interval.start < end) {
        fail("PATCH records overlap");
      }
    }
  }

  #resetTentative(): void {
    this.#imageSpool = this.#spoolFactory();
    this.#patchSpool = this.#spoolFactory();
    this.#imageCount = 0;
    this.#patchCount = 0;
    this.#imageHighWater = 0;
    this.#patchHighWater = 0;
    this.#imageEnds.clear();
    this.#patchIntervals.clear();
  }
}

const cloneMap = (map: NobjMap): NobjMap => ({
  ...map,
  partBanks: [...map.partBanks],
  banks: map.banks.map((bank) => ({ ...bank })),
});

const decodeBegin = (
  bytes: Uint8Array,
  recordValue: DecodedRecord,
): NobjBegin => {
  if (recordValue.payloadEnd - recordValue.payloadStart !== 15) {
    fail("BEGIN payload length must be 15");
  }
  const p = recordValue.payloadStart;
  if (
    bytes[p] !== 0x4e ||
    bytes[p + 1] !== 0x4f ||
    bytes[p + 2] !== 0x42 ||
    bytes[p + 3] !== 0x4a
  ) {
    fail("BEGIN magic is not NOBJ");
  }
  if (
    bytes[p + 4] !== NOBJ_MAJOR_VERSION ||
    bytes[p + 5] !== NOBJ_MINOR_VERSION
  ) {
    fail("unsupported NOBJ version");
  }
  const flags = bytes[p + 6] ?? 0;
  if ((flags & 0xfe) !== 0) fail("BEGIN contains reserved flags");
  const begin: NobjBegin = {
    banked: (flags & 1) !== 0,
    runtimeIdentity: readU16(bytes, p + 7),
    bankCount: bytes[p + 9] ?? 0,
    imageFill: bytes[p + 10] ?? 0,
    imageBase: readU16(bytes, p + 11),
    imageCapacity: readU16(bytes, p + 13),
  };
  validateBegin(begin);
  return begin;
};

const decodeImageLike = (
  bytes: Uint8Array,
  recordValue: DecodedRecord,
  name: "IMAGE" | "PATCH",
): NobjImageRecord => {
  const length = recordValue.payloadEnd - recordValue.payloadStart;
  if (length < 4) fail(`${name} payload length must be at least 4`);
  const p = recordValue.payloadStart;
  return {
    bank: bytes[p] ?? 0,
    address: readU16(bytes, p + 1),
    bytes: bytes.slice(p + 3, recordValue.payloadEnd),
  };
};

const decodeMap = (bytes: Uint8Array, recordValue: DecodedRecord): NobjMap => {
  const p = recordValue.payloadStart;
  const length = recordValue.payloadEnd - p;
  if (length < 41)
    fail("MAP payload is shorter than its fixed fields and one bank");
  if (bytes[p] !== NOBJ_MAP_REVISION) fail("unsupported MAP revision");
  const flags = bytes[p + 1] ?? 0;
  if ((flags & 0xfc) !== 0) fail("MAP contains reserved flags");
  const partCount = bytes[p + 28] ?? 0;
  if (partCount === 0) fail("MAP part count must be nonzero");
  const bankCountOffset = p + 29 + partCount;
  if (bankCountOffset >= recordValue.payloadEnd)
    fail("MAP is truncated before bank-entry count");
  const bankEntryCount = bytes[bankCountOffset] ?? 0;
  const expectedLength = 30 + partCount + 10 * bankEntryCount;
  if (length !== expectedLength) fail("MAP payload length is inconsistent");
  const banks: NobjBankMap[] = [];
  let cursor = bankCountOffset + 1;
  for (let index = 0; index < bankEntryCount; index += 1) {
    banks.push({
      usedLength: readU16(bytes, cursor),
      readOnlyBase: readU16(bytes, cursor + 2),
      readOnlyLength: readU16(bytes, cursor + 4),
      aggregateConstantBase: readU16(bytes, cursor + 6),
      aggregateConstantLength: readU16(bytes, cursor + 8),
    });
    cursor += 10;
  }
  return {
    romMode: (flags & 1) !== 0,
    establishedStack: (flags & 2) !== 0,
    entryBank: bytes[p + 2] ?? 0,
    entryAddress: readU16(bytes, p + 3),
    writableBase: readU16(bytes, p + 5),
    writableCapacity: readU16(bytes, p + 7),
    vectorBase: readU16(bytes, p + 9),
    vectorLength: readU16(bytes, p + 11),
    initializedRunBase: readU16(bytes, p + 13),
    initializedRunLength: readU16(bytes, p + 15),
    bssBase: readU16(bytes, p + 17),
    bssLength: readU16(bytes, p + 19),
    stackRequirement: readU16(bytes, p + 21),
    dataLoadBank: bytes[p + 23] ?? 0,
    dataLoadAddress: readU16(bytes, p + 24),
    dataLoadLength: readU16(bytes, p + 26),
    partBanks: Array.from(bytes.slice(p + 29, bankCountOffset)),
    banks,
  };
};

const validateMap = (
  begin: NobjBegin,
  map: NobjMap,
  images: readonly NobjImageRecord[],
  patches: readonly NobjImageRecord[],
): void => {
  requireU8("MAP entry bank", map.entryBank);
  requireU16("MAP entry address", map.entryAddress);
  requireU16("MAP writable base", map.writableBase);
  requireU16("MAP writable capacity", map.writableCapacity);
  if (map.writableCapacity === 0) fail("MAP writable capacity must be nonzero");
  const writableEnd = checkedEnd(
    "MAP writable region",
    map.writableBase,
    map.writableCapacity,
  );
  for (const [name, value] of [
    ["vector base", map.vectorBase],
    ["vector length", map.vectorLength],
    ["initialized run base", map.initializedRunBase],
    ["initialized run length", map.initializedRunLength],
    ["BSS base", map.bssBase],
    ["BSS length", map.bssLength],
    ["stack requirement", map.stackRequirement],
    ["data-load address", map.dataLoadAddress],
    ["data-load length", map.dataLoadLength],
  ] as const) {
    requireU16(`MAP ${name}`, value);
  }
  if (map.banks.length !== begin.bankCount)
    fail("MAP bank-entry count differs from BEGIN.bankCount");
  if (map.entryBank >= begin.bankCount) fail("MAP entry bank is out of range");
  if (map.dataLoadBank >= begin.bankCount)
    fail("MAP data-load bank is out of range");
  if (map.partBanks.length < 1 || map.partBanks.length > 0xff)
    fail("MAP part count is outside 1..255");
  for (const bank of map.partBanks) {
    if (bank >= begin.bankCount) fail("MAP source-part bank is out of range");
  }
  if (begin.banked && !map.romMode) fail("a banked object must use ROM mode");
  if (!begin.banked && map.entryBank !== 0)
    fail("a flat object must enter bank zero");

  const imageEnd = begin.imageBase + begin.imageCapacity;
  const regionsOverlap =
    begin.imageBase < writableEnd && map.writableBase < imageEnd;
  const writableInsideImage =
    map.writableBase >= begin.imageBase && writableEnd <= imageEnd;
  if (map.romMode) {
    if (regionsOverlap) fail("ROM-mode writable and image regions overlap");
  } else if (!writableInsideImage) {
    fail("loaded-mode writable region is not wholly inside the image region");
  }

  if (
    map.vectorBase !== map.writableBase ||
    map.initializedRunBase !== map.writableBase
  ) {
    fail("MAP vector and initialized run must begin at writableBase");
  }
  if (map.vectorLength === 0 || map.vectorLength > map.initializedRunLength) {
    fail("MAP vector length must be nonzero and fit initialized data");
  }
  const initializedEnd = checkedEnd(
    "MAP initialized run",
    map.initializedRunBase,
    map.initializedRunLength,
  );
  if (map.bssBase !== initializedEnd)
    fail("MAP BSS must follow initialized data");
  const bssEnd = checkedEnd("MAP BSS", map.bssBase, map.bssLength);
  if (map.initializedRunBase < map.writableBase || bssEnd > writableEnd) {
    fail("MAP initialized data and BSS exceed writable capacity");
  }
  if (map.establishedStack && writableEnd - bssEnd < map.stackRequirement + 2) {
    fail("MAP established stack does not fit writable capacity");
  }
  if (map.dataLoadLength !== map.initializedRunLength) {
    fail("MAP data-load length differs from initialized run length");
  }
  if (!map.romMode) {
    if (
      map.dataLoadBank !== 0 ||
      map.dataLoadAddress !== map.initializedRunBase
    ) {
      fail("loaded MAP data load must use bank zero at initializedRunBase");
    }
  } else if (begin.banked && map.dataLoadBank !== map.entryBank) {
    fail("banked ROM data load must occupy the entry bank");
  }

  const highestEnds = Array.from(
    { length: begin.bankCount },
    () => begin.imageBase,
  );
  for (const item of [...images, ...patches]) {
    if (item.bank >= begin.bankCount)
      fail("record bank is outside BEGIN.bankCount");
    const end = requireRegion(
      "object record",
      item.address,
      item.bytes.length,
      begin.imageBase,
      begin.imageCapacity,
    );
    highestEnds[item.bank] = Math.max(
      highestEnds[item.bank] ?? begin.imageBase,
      end,
    );
  }

  for (let bankIndex = 0; bankIndex < map.banks.length; bankIndex += 1) {
    const bank = map.banks[bankIndex];
    if (bank === undefined) fail("MAP bank entry is missing");
    if (bank.usedLength === 0 || bank.usedLength > begin.imageCapacity) {
      fail("MAP used length is outside 1..imageCapacity");
    }
    const usedEnd = begin.imageBase + bank.usedLength;
    if (highestEnds[bankIndex] !== usedEnd)
      fail("MAP used length differs from record extent");
    for (const item of [...images, ...patches]) {
      if (
        item.bank === bankIndex &&
        item.address + item.bytes.length > usedEnd
      ) {
        fail("record lies beyond MAP.usedLength");
      }
    }
    validateOptionalImageExtent(
      "read-only",
      bank.readOnlyBase,
      bank.readOnlyLength,
      begin.imageBase,
      usedEnd,
    );
    validateOptionalImageExtent(
      "aggregate-constant",
      bank.aggregateConstantBase,
      bank.aggregateConstantLength,
      begin.imageBase,
      usedEnd,
    );
    if (bank.aggregateConstantLength > 0) {
      const readOnlyEnd = bank.readOnlyBase + bank.readOnlyLength;
      const aggregateEnd =
        bank.aggregateConstantBase + bank.aggregateConstantLength;
      if (
        bank.readOnlyLength === 0 ||
        bank.aggregateConstantBase < bank.readOnlyBase ||
        aggregateEnd > readOnlyEnd
      ) {
        fail("aggregate-constant extent is outside read-only extent");
      }
    }
  }

  const entryUsedEnd =
    begin.imageBase + (map.banks[map.entryBank]?.usedLength ?? 0);
  if (map.entryAddress < begin.imageBase || map.entryAddress >= entryUsedEnd) {
    fail("MAP entry address is outside the entry bank used extent");
  }
  if (!map.romMode) {
    const loadedUsedEnd = begin.imageBase + (map.banks[0]?.usedLength ?? 0);
    if (loadedUsedEnd !== initializedEnd) {
      fail("loaded image must end at the initialized-data run end");
    }
    if (map.entryAddress >= map.writableBase) {
      fail("loaded entry address must precede writable storage");
    }
  }
  if (map.romMode) {
    const loadUsedEnd =
      begin.imageBase + (map.banks[map.dataLoadBank]?.usedLength ?? 0);
    const loadEnd = checkedEnd(
      "MAP data-load extent",
      map.dataLoadAddress,
      map.dataLoadLength,
    );
    if (map.dataLoadAddress < begin.imageBase || loadEnd > loadUsedEnd) {
      fail("MAP data-load extent is outside its bank used extent");
    }
  }
};

const validateOptionalImageExtent = (
  name: string,
  base: number,
  length: number,
  imageBase: number,
  usedEnd: number,
): void => {
  requireU16(`${name} base`, base);
  requireU16(`${name} length`, length);
  if (length === 0) {
    if (base !== 0) fail(`zero-length ${name} extent must have base zero`);
    return;
  }
  const end = checkedEnd(`${name} extent`, base, length);
  if (base < imageBase || end > usedEnd)
    fail(`${name} extent is outside used image`);
};

export const parseNobj = (serialized: Uint8Array): ParsedNobj => {
  const records: DecodedRecord[] = [];
  let cursor = 0;
  while (cursor < serialized.length) {
    if (serialized.length - cursor < 3) fail("truncated record header");
    const kind = serialized[cursor] ?? 0;
    if (
      !Object.values(NobjKind).includes(
        kind as (typeof NobjKind)[keyof typeof NobjKind],
      )
    ) {
      fail("reserved NOBJ record kind");
    }
    const payloadLength = readU16(serialized, cursor + 1);
    const payloadStart = cursor + 3;
    const payloadEnd = payloadStart + payloadLength;
    if (payloadEnd > serialized.length)
      fail(`truncated ${kindName(kind)} payload`);
    records.push({ kind, start: cursor, payloadStart, payloadEnd });
    cursor = payloadEnd;
    if (kind === NobjKind.commit) {
      if (cursor !== serialized.length) fail("byte after COMMIT");
      break;
    }
  }
  if (records.length === 0) fail("NOBJ stream is empty");
  if (records.at(-1)?.kind !== NobjKind.commit)
    fail("NOBJ stream has no terminal COMMIT");

  let phase: "begin" | "image" | "patch" | "map" | "commit" = "begin";
  let begin: NobjBegin | undefined;
  let map: NobjMap | undefined;
  let commit: NobjCommit | undefined;
  const images: NobjImageRecord[] = [];
  const patches: NobjImageRecord[] = [];
  const imageEnds = new Map<number, number>();
  const patchIntervals = new Map<number, Interval[]>();

  for (const [index, recordValue] of records.entries()) {
    switch (recordValue.kind) {
      case NobjKind.begin:
        if (phase !== "begin" || index !== 0)
          fail("BEGIN must be the first and only BEGIN record");
        begin = decodeBegin(serialized, recordValue);
        phase = "image";
        break;
      case NobjKind.image: {
        if (phase !== "image") fail("IMAGE appears outside the IMAGE phase");
        if (begin === undefined) fail("IMAGE appears before BEGIN");
        const activeBegin = begin as NobjBegin;
        const item = decodeImageLike(serialized, recordValue, "IMAGE");
        if (item.bank >= activeBegin.bankCount)
          fail("IMAGE bank is out of range");
        const end = requireRegion(
          "IMAGE",
          item.address,
          item.bytes.length,
          activeBegin.imageBase,
          activeBegin.imageCapacity,
        );
        const previousEnd = imageEnds.get(item.bank);
        if (previousEnd !== undefined && item.address < previousEnd) {
          fail("IMAGE records descend or overlap within a bank");
        }
        imageEnds.set(item.bank, end);
        images.push(item);
        break;
      }
      case NobjKind.patch: {
        if (phase !== "image" && phase !== "patch")
          fail("PATCH appears outside the PATCH phase");
        if (images.length === 0) fail("PATCH requires at least one IMAGE");
        if (begin === undefined) fail("PATCH appears before BEGIN");
        const activeBegin = begin as NobjBegin;
        phase = "patch";
        const item = decodeImageLike(serialized, recordValue, "PATCH");
        if (item.bank >= activeBegin.bankCount)
          fail("PATCH bank is out of range");
        const end = requireRegion(
          "PATCH",
          item.address,
          item.bytes.length,
          activeBegin.imageBase,
          activeBegin.imageCapacity,
        );
        const intervals = patchIntervals.get(item.bank) ?? [];
        for (const interval of intervals) {
          if (item.address < interval.end && interval.start < end) {
            fail("PATCH records overlap");
          }
        }
        intervals.push({ start: item.address, end });
        patchIntervals.set(item.bank, intervals);
        patches.push(item);
        break;
      }
      case NobjKind.map:
        if ((phase !== "image" && phase !== "patch") || images.length === 0) {
          fail("MAP must follow IMAGE+ PATCH*");
        }
        map = decodeMap(serialized, recordValue);
        phase = "map";
        break;
      case NobjKind.commit: {
        if (phase !== "map" || map === undefined)
          fail("COMMIT must follow MAP");
        const activeMap = map as NobjMap;
        if (recordValue.payloadEnd - recordValue.payloadStart !== 7) {
          fail("COMMIT payload length must be 7");
        }
        const p = recordValue.payloadStart;
        const recordCount = readU16(serialized, p);
        const entryBank = serialized[p + 2] ?? 0;
        const entryAddress = readU16(serialized, p + 3);
        const storedCrc = readU16(serialized, p + 5);
        if (recordCount !== records.length)
          fail("COMMIT record count is incorrect");
        if (
          entryBank !== activeMap.entryBank ||
          entryAddress !== activeMap.entryAddress
        ) {
          fail("COMMIT entry pair differs from MAP");
        }
        const crcOffset = p + 5;
        const actualCrc = crc16CcittFalse(serialized.slice(0, crcOffset));
        if (storedCrc !== actualCrc) fail("COMMIT CRC is incorrect");
        commit = { recordCount, entryBank, entryAddress, crc16: storedCrc };
        phase = "commit";
        break;
      }
    }
  }

  if (
    begin === undefined ||
    map === undefined ||
    commit === undefined ||
    phase !== "commit"
  ) {
    fail("NOBJ record sequence is incomplete");
  }
  const completedBegin = begin as NobjBegin;
  const completedMap = map as NobjMap;
  const completedCommit = commit as NobjCommit;
  validateMap(completedBegin, completedMap, images, patches);
  return {
    serialized: serialized.slice(),
    begin: completedBegin,
    images,
    patches,
    map: completedMap,
    commit: completedCommit,
  };
};

const kindName = (kind: number): string => {
  switch (kind) {
    case NobjKind.begin:
      return "BEGIN";
    case NobjKind.image:
      return "IMAGE";
    case NobjKind.patch:
      return "PATCH";
    case NobjKind.map:
      return "MAP";
    case NobjKind.commit:
      return "COMMIT";
    default:
      return "reserved record";
  }
};

export const materializeNobj = (parsed: ParsedNobj): MaterializedNobj => {
  // Re-validate retained bytes so callers cannot materialize a hand-built ParsedNobj.
  const validated = parseNobj(parsed.serialized);
  const banks = Array.from({ length: validated.begin.bankCount }, () => {
    const image = new Uint8Array(validated.begin.imageCapacity);
    image.fill(validated.begin.imageFill);
    return image;
  });
  for (const item of [...validated.images, ...validated.patches]) {
    const bank = banks[item.bank];
    if (bank === undefined) fail("materializer bank is unavailable");
    bank.set(item.bytes, item.address - validated.begin.imageBase);
  }
  return {
    parsed: validated,
    banks,
    ...(validated.begin.banked ? {} : { flatImage: banks[0] }),
  };
};
