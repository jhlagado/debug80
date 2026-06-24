/**
 * @file TEC-1G expansion ROM loading helpers.
 */

import fs from 'fs';
import { TEC1G_EXPAND_END, TEC1G_EXPAND_SIZE, TEC1G_EXPAND_START } from '../tec-common';
import { extractRomHex } from '../../debug/launch/program-loader';
import { parseIntelHex } from '../../z80/loaders';

const TEC1G_EXPANSION_BANK_COUNT = 2;

export type Tec1gExpansionRomImage = {
  banks: Uint8Array[];
  memory: Uint8Array;
  windowAddress: number;
  windowSize: number;
  bankSize: number;
  bankCount: number;
  initialBank: number;
  bootEntry: number | null;
};

/**
 * Returns whether the loaded image contains any non-zero data in the expansion region.
 */
function isTec1gExpansionRomBootable(bank: Uint8Array | undefined): boolean {
  if (bank === undefined) {
    return false;
  }
  for (const value of bank) {
    if (value !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Loads a TEC-1G expansion ROM image from either raw binary or Intel HEX content.
 */
export function loadTec1gExpansionRomImage(expansionRomPath: string): Tec1gExpansionRomImage {
  const lower = expansionRomPath.toLowerCase();
  let banks: Uint8Array[];
  if (lower.endsWith('.bin')) {
    const buffer = fs.readFileSync(expansionRomPath);
    const bytes = new Uint8Array(buffer);
    banks = banksFromBinary(bytes);
  } else {
    const content = fs.readFileSync(expansionRomPath, 'utf-8');
    const hexContent = extractRomHex(content, expansionRomPath);
    banks = banksFromMemory(parseIntelHex(hexContent).memory);
  }
  const initialBank = 0;
  const memory = projectInitialBankToMemory(banks, initialBank);
  const bootEntry = isTec1gExpansionRomBootable(banks[initialBank]) ? TEC1G_EXPAND_START : null;
  return {
    banks,
    memory,
    windowAddress: TEC1G_EXPAND_START,
    windowSize: TEC1G_EXPAND_SIZE,
    bankSize: TEC1G_EXPAND_SIZE,
    bankCount: banks.length,
    initialBank,
    bootEntry,
  };
}

/**
 * Splits a raw expansion ROM binary into fixed-size switchable banks.
 */
function banksFromBinary(bytes: Uint8Array): Uint8Array[] {
  const bankCount = Math.min(
    TEC1G_EXPANSION_BANK_COUNT,
    Math.max(1, Math.ceil(bytes.length / TEC1G_EXPAND_SIZE))
  );
  const banks: Uint8Array[] = [];
  for (let bankIndex = 0; bankIndex < bankCount; bankIndex += 1) {
    const bank = new Uint8Array(TEC1G_EXPAND_SIZE);
    const start = bankIndex * TEC1G_EXPAND_SIZE;
    bank.set(bytes.slice(start, start + TEC1G_EXPAND_SIZE));
    banks.push(bank);
  }
  return banks;
}

/**
 * Extracts expansion banks from a legacy 64K memory image.
 */
function banksFromMemory(memory: Uint8Array): Uint8Array[] {
  const bank0 = new Uint8Array(TEC1G_EXPAND_SIZE);
  const bank1 = new Uint8Array(TEC1G_EXPAND_SIZE);
  bank0.set(memory.slice(TEC1G_EXPAND_START, TEC1G_EXPAND_END + 1));
  bank1.set(
    memory.slice(TEC1G_EXPAND_START + TEC1G_EXPAND_SIZE, TEC1G_EXPAND_START + TEC1G_EXPAND_SIZE * 2)
  );
  return hasAnyPayload(bank1) ? [bank0, bank1] : [bank0];
}

/**
 * Projects the initially visible expansion bank into a 64K memory image.
 */
function projectInitialBankToMemory(banks: Uint8Array[], initialBank: number): Uint8Array {
  const memory = new Uint8Array(0x10000);
  const bank = banks[initialBank];
  if (bank !== undefined) {
    memory.set(bank, TEC1G_EXPAND_START);
  }
  return memory;
}

/**
 * Returns whether a bank contains any non-zero payload byte.
 */
function hasAnyPayload(bank: Uint8Array): boolean {
  return bank.some((value) => value !== 0);
}
