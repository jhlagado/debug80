/**
 * @fileoverview Address aliasing and breakpoint checks.
 */

import {
  ADDR_MASK,
  TEC1G_EXPAND_END,
  TEC1G_EXPAND_START,
  TEC1G_SHADOW_START,
  TEC1G_SHADOW_SIZE,
} from '../../platforms/tec-common';
import type { Tec1gRuntime } from '../../platforms/tec1g/runtime';
import type { SourceAddressSpace } from '../../mapping/types';

export function getShadowAlias(
  address: number,
  options: { activePlatform: string; tec1gRuntime: Tec1gRuntime | undefined }
): number | null {
  if (options.activePlatform !== 'tec1g') {
    return null;
  }
  const runtime = options.tec1gRuntime;
  if (!runtime || runtime.state.system.shadowEnabled !== true) {
    return null;
  }
  if (address < TEC1G_SHADOW_SIZE) {
    return (TEC1G_SHADOW_START + address) & ADDR_MASK;
  }
  return null;
}

export function isBreakpointAddress(
  address: number | null,
  options: {
    hasBreakpoint: (addr: number, addressSpace?: SourceAddressSpace) => boolean;
    activePlatform: string;
    tec1gRuntime: Tec1gRuntime | undefined;
  }
): boolean {
  if (address === null) {
    return false;
  }
  const expansionAddressSpace = getTec1gExpansionAddressSpace(address, {
    activePlatform: options.activePlatform,
    tec1gRuntime: options.tec1gRuntime,
  });
  if (expansionAddressSpace !== undefined && options.hasBreakpoint(address, expansionAddressSpace)) {
    return true;
  }
  if (options.hasBreakpoint(address)) {
    return true;
  }
  const shadowAlias = getShadowAlias(address, {
    activePlatform: options.activePlatform,
    tec1gRuntime: options.tec1gRuntime,
  });
  return shadowAlias !== null && options.hasBreakpoint(shadowAlias);
}

export function getTec1gExpansionAddressSpace(
  address: number,
  options: { activePlatform: string; tec1gRuntime: Tec1gRuntime | undefined }
): SourceAddressSpace | undefined {
  if (options.activePlatform !== 'tec1g') {
    return undefined;
  }
  const runtime = options.tec1gRuntime;
  if (runtime?.state.system.expandEnabled !== true) {
    return undefined;
  }
  const masked = address & ADDR_MASK;
  if (masked < TEC1G_EXPAND_START || masked > TEC1G_EXPAND_END) {
    return undefined;
  }
  const physicalBank = runtime.state.system.memoryExpansionPhysicalBank;
  if (!Number.isInteger(physicalBank) || physicalBank < 0) {
    return undefined;
  }
  return { kind: 'tec1g-expansion', physicalBank };
}
