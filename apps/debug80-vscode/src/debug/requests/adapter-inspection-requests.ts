import { ADDR_MASK } from '@jhlagado/debug80-runtime/platforms/tec-common';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { getShadowAlias, getTec1gExpansionAddressSpace } from '../mapping/debug-addressing';
import { resolveMappedPath } from '../mapping/path-resolver';
import { buildStackFrames, flushDiagLog, isDiagnosticsEnabled } from '../mapping/stack-service';
import { tryWriteRegisterByKey, writableRegisterKeyFromVariableName } from './register-request';
import { emitConsoleDiagnostic } from './request-events';
import type { AdapterRequestControllerDeps } from './adapter-request-deps';
import { buildEvaluateResponseBody } from './watch-expression';

export class AdapterInspectionRequests {
  public constructor(private readonly deps: AdapterRequestControllerDeps) {}

  public stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments
  ): void {
    if (this.deps.sessionState.runtime === undefined) {
      response.body = { stackFrames: [], totalFrames: 0 };
      this.deps.sendResponse(response);
      return;
    }
    const pc = this.deps.sessionState.runtime.getPC();
    const resolveFn = (file: string): string | undefined =>
      resolveMappedPath(file, undefined, this.deps.sessionState.sourceRoots);
    const responseBody = buildStackFrames(pc, {
      ...(this.deps.sessionState.mappingIndex !== undefined
        ? { mappingIndex: this.deps.sessionState.mappingIndex }
        : {}),
      ...(this.deps.sourceState.file !== undefined
        ? { sourceFile: this.deps.sourceState.file }
        : {}),
      symbolAnchors: this.deps.sessionState.symbolAnchors,
      lookupAnchors: this.deps.sourceState.lookupAnchors,
      stackPointer: this.deps.sessionState.runtime.getRegisters().sp,
      maxStackFrames: 8,
      readMemory: (address) =>
        this.deps.sessionState.runtime?.hardware.memRead?.(address) ??
        this.deps.sessionState.runtime?.hardware.memory[address & ADDR_MASK] ??
        0,
      resolveMappedPath: resolveFn,
      getAddressAliases: (address) => {
        const masked = address & ADDR_MASK;
        const aliases = [masked];
        const shadowAlias = getShadowAlias(masked, {
          activePlatform: this.deps.platformState.active,
          tec1gRuntime: this.deps.sessionState.tec1gRuntime,
        });
        if (shadowAlias !== null && shadowAlias !== masked) {
          aliases.push(shadowAlias);
        }
        return aliases;
      },
      getAddressSpace: (address) =>
        getTec1gExpansionAddressSpace(address & ADDR_MASK, {
          activePlatform: this.deps.platformState.active,
          tec1gRuntime: this.deps.sessionState.tec1gRuntime,
        }),
    });

    if (isDiagnosticsEnabled()) {
      const diagLines = flushDiagLog();
      const frame = responseBody.stackFrames[0];
      const hasMappingIndex = this.deps.sessionState.mappingIndex !== undefined;
      const segCount = this.deps.sessionState.mappingIndex?.segmentsByAddress?.length ?? 0;
      const diagText = [
        `[debug80-diag] PC=0x${pc.toString(16).padStart(4, '0')} ` +
          `mappingIndex=${hasMappingIndex} (${segCount} segs) ` +
          `sourceFile="${this.deps.sourceState.file ?? '(none)'}" ` +
          `sourceRoots=[${this.deps.sessionState.sourceRoots.join(', ')}]`,
        ...diagLines,
        `  => frame.source="${frame?.source?.path ?? '(none)'}" line=${frame?.line ?? '?'}`,
      ].join('\n');
      emitConsoleDiagnostic(this.deps.sendEvent, diagText);
    }

    response.body = responseBody;
    this.deps.sendResponse(response);
  }

  public scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments
  ): void {
    response.body = {
      scopes: this.deps.variableService.createScopes(this.deps.sessionState.sourceMapSymbols),
    };
    this.deps.sendResponse(response);
  }

  public variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    response.body = {
      variables: this.deps.variableService.resolveVariables(
        args.variablesReference,
        this.deps.sessionState.runtime
      ),
    };
    this.deps.sendResponse(response);
  }

  public evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments
  ): void {
    try {
      response.body = buildEvaluateResponseBody(args.expression, {
        runtime: this.deps.sessionState.runtime,
        symbols: this.deps.sessionState.sourceMapSymbols,
      });
      this.deps.sendResponse(response);
    } catch (err) {
      this.deps.sendErrorResponse(response, 1, String(err instanceof Error ? err.message : err));
    }
  }

  public setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments
  ): void {
    if (!this.deps.variableService.isRegistersVariablesReference(args.variablesReference)) {
      this.deps.sendErrorResponse(response, 1, 'Debug80: This variable cannot be edited here.');
      return;
    }
    const registerKey = writableRegisterKeyFromVariableName(args.name);
    if (registerKey === null) {
      this.deps.sendErrorResponse(
        response,
        1,
        'Debug80: This register is read-only or not recognized.'
      );
      return;
    }
    const err = tryWriteRegisterByKey(this.deps.sessionState, registerKey, args.value);
    if (err !== null) {
      this.deps.sendErrorResponse(response, 1, err);
      return;
    }
    const variables = this.deps.variableService.resolveVariables(
      args.variablesReference,
      this.deps.sessionState.runtime
    );
    const updated = variables.find((variable) => variable.name === args.name);
    response.body = { value: updated?.value ?? String(args.value) };
    this.deps.sendResponse(response);
  }
}
