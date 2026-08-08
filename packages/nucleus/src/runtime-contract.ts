/** Canonical numeric assignments for the direct Nucleus Z80 runtime contract. */

export const Trap = {
  bounds: 0x01,
  narrowing: 0x02,
  divisionByZero: 0x03,
  loopRange: 0x04,
  activationCapacity: 0x05,
  unhandledError: 0x06,
} as const;

export const Service = {
  readInputByte: 0x00,
  writeOutputByte: 0x01,
  readStorageByte: 0x02,
  rewindStorageInput: 0x03,
  writeStorageByte: 0x04,
  seekStorageOutput: 0x05,
} as const;

export const ServiceError = {
  endOfInput: 0x01,
  inputFailure: 0x02,
  outputFailure: 0x03,
  storageFailure: 0x04,
} as const;
