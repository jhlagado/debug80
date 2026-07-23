import { ADDR_MASK } from '@jhlagado/debug80-runtime/platforms/tec-common';
import type { DebugProtocol } from '@vscode/debugprotocol';
import {
  findSegmentForAddress,
  resolveExecutableLocationTargets,
  type ResolvedSourceAddress,
} from '../../mapping/source-map';
import { normalizeSourcePath } from '../mapping/path-resolver';
import type { RuntimeStopTarget } from '../session/runtime-control';
import { emitSourceMapMissing } from './request-events';
import type { AdapterRequestControllerDeps } from './adapter-request-deps';

function readFrameId(args: unknown): number | undefined {
  if (typeof args !== 'object' || args === null || !('frameId' in args)) {
    return undefined;
  }
  const value = (args as { frameId?: unknown }).frameId;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

export class AdapterNavigationRequests {
  private readonly gotoTargets = new Map<number, RuntimeStopTarget>();
  private nextGotoTargetId = 1;

  public constructor(
    private readonly deps: AdapterRequestControllerDeps,
    private readonly prepareRun: () => void,
    private readonly runUntilStop: (
      extraBreakpoints?: RuntimeStopTarget[],
      maxInstructions?: number,
      limitLabel?: string
    ) => void
  ) {}

  public gotoTargetsRequest(
    response: DebugProtocol.GotoTargetsResponse,
    args: DebugProtocol.GotoTargetsArguments
  ): void {
    const sourcePath = args.source?.path;
    const line = args.line ?? 0;
    const mappingIndex = this.deps.sessionState.mappingIndex;
    if (sourcePath === undefined || sourcePath.length === 0 || mappingIndex === undefined) {
      response.body = { targets: [] };
      emitSourceMapMissing(this.deps.sendEvent);
      this.deps.sendResponse(response);
      return;
    }

    const normalized = normalizeSourcePath(sourcePath, this.deps.sessionState.baseDir);
    const direct = resolveExecutableLocationTargets(mappingIndex, normalized, line);
    const addresses = direct.length > 0 ? direct : this.resolveGotoByBasename(normalized, line);
    const targets = addresses.map((target) => {
      const id = this.nextGotoTargetId++;
      const address = target.address & ADDR_MASK;
      this.gotoTargets.set(id, {
        address,
        ...(target.addressSpace !== undefined ? { addressSpace: target.addressSpace } : {}),
      });
      return {
        id,
        label: `$${address.toString(16).toUpperCase().padStart(4, '0')}`,
        line,
      };
    });
    response.body = { targets };
    this.deps.sendResponse(response);
  }

  public gotoRequest(
    response: DebugProtocol.GotoResponse,
    args: DebugProtocol.GotoArguments
  ): void {
    const target = this.gotoTargets.get(args.targetId);
    if (target === undefined) {
      this.deps.sendErrorResponse(response, 1, 'Debug80: Run to Cursor target is unavailable.');
      return;
    }
    if (this.deps.sessionState.runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }
    this.gotoTargets.delete(args.targetId);
    this.deps.sendResponse(response);
    this.prepareRun();
    this.runUntilStop([target], undefined, 'run to cursor');
  }

  public runToStackFrameRequest(response: DebugProtocol.Response, args: unknown): boolean {
    const frameId = readFrameId(args);
    const runtime = this.deps.sessionState.runtime;
    if (runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return true;
    }
    if (frameId === undefined || frameId < 1) {
      this.deps.sendErrorResponse(response, 1, 'Select a stack return frame, not the current PC.');
      return true;
    }
    const sp = runtime.getRegisters().sp & ADDR_MASK;
    const stackAddress = (sp + (frameId - 1) * 2) & ADDR_MASK;
    const returnAddress = this.readWord(stackAddress);
    const segment =
      this.deps.sessionState.mappingIndex !== undefined
        ? findSegmentForAddress(this.deps.sessionState.mappingIndex, returnAddress)
        : undefined;
    if (segment === undefined || segment.loc.file === null) {
      this.deps.sendErrorResponse(
        response,
        1,
        `Stack entry $${returnAddress.toString(16).padStart(4, '0')} is not mapped to source code.`
      );
      return true;
    }

    this.deps.sendResponse(response);
    this.prepareRun();
    this.runUntilStop([{ address: returnAddress & ADDR_MASK }], undefined, 'stack frame return');
    return true;
  }

  private readWord(address: number): number {
    const runtime = this.deps.sessionState.runtime;
    const readByte = (addr: number): number =>
      runtime?.hardware.memRead?.(addr) ?? runtime?.hardware.memory[addr & ADDR_MASK] ?? 0;
    return (readByte(address) & 0xff) | ((readByte((address + 1) & ADDR_MASK) & 0xff) << 8);
  }

  private resolveGotoByBasename(sourcePath: string, line: number): ResolvedSourceAddress[] {
    const mappingIndex = this.deps.sessionState.mappingIndex;
    if (mappingIndex === undefined) {
      return [];
    }
    const want = sourcePath.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    const lineSlop = [0, -1, 1, -2, 2, -3, 3, -4, 4];
    for (const [fileKey, fileMap] of mappingIndex.segmentsByFileLine.entries()) {
      if ((fileKey.split(/[\\/]/).pop()?.toLowerCase() ?? '') !== want) {
        continue;
      }
      for (const delta of lineSlop) {
        const tryLine = line + delta;
        if (tryLine < 1) {
          continue;
        }
        const segments = fileMap.get(tryLine);
        const executable = segments?.filter((segment) => segment.end > segment.start) ?? [];
        if (executable.length > 0) {
          return executable.map((segment) => ({
            address: segment.start,
            ...(segment.addressSpace !== undefined ? { addressSpace: segment.addressSpace } : {}),
          }));
        }
      }
    }
    return [];
  }
}
