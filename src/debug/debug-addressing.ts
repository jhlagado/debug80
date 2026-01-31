/**
 * @fileoverview Address aliasing and breakpoint checks.
 */

import {
  ADDR_MASK,
  TEC1G_SHADOW_START,
  TEC1G_SHADOW_SIZE,
} from '../platforms/tec-common';
import type { Tec1gRuntime } from '../platforms/tec1g/runtime';

export function getShadowAlias(
  address: number,
  options: { activePlatform: string; tec1gRuntime: Tec1gRuntime | undefined }
): number | null {
  if (options.activePlatform !== 'tec1g') {
    return null;
  }
  const runtime = options.tec1gRuntime;
  if (!runtime || runtime.state.shadowEnabled !== true) {
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
    hasBreakpoint: (addr: number) => boolean;
    activePlatform: string;
    tec1gRuntime: Tec1gRuntime | undefined;
  }
): boolean {
  if (address === null) {
    return false;
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
