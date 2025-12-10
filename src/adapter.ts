import * as vscode from 'vscode';
import { DebugSession, InitializedEvent, StoppedEvent, TerminatedEvent, Thread, StackFrame, Scope, Source, Handles, BreakpointEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { Event as DapEvent } from '@vscode/debugadapter';
import { parseIntelHex, parseListing, ListingInfo } from './z80-loaders';
import {
  createZ80Runtime,
  Z80Runtime,
  IoHandlers,
} from './z80-runtime';

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  asm?: string;
  sourceFile?: string;
  hex?: string;
  listing?: string;
  outputDir?: string;
  artifactBase?: string;
  entry?: number;
  stopOnEntry?: boolean;
  projectConfig?: string;
  target?: string;
  assemble?: boolean;
  terminal?: TerminalConfig;
}

interface TerminalConfig {
  txPort?: number;
  rxPort?: number;
  statusPort?: number;
  interrupt?: boolean;
}

interface TerminalState {
  config: TerminalConfigNormalized;
  input: number[];
  breakRequested?: boolean;
}

interface TerminalConfigNormalized {
  txPort: number;
  rxPort: number;
  statusPort: number;
  interrupt: boolean;
}

const THREAD_ID = 1;

export class Z80DebugSession extends DebugSession {
  private runtime: Z80Runtime | undefined;
  private listing: ListingInfo | undefined;
  private listingPath: string | undefined;
  private sourceFile = '';
  private stopOnEntry = false;
  private haltNotified = false;
  private variableHandles = new Handles<'registers'>();
  private breakpoints: Set<number> = new Set();
  private terminalState: TerminalState | undefined;
  private pendingBreakpoints: DebugProtocol.SourceBreakpoint[] = [];

  public constructor() {
    super();
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments
  ): void {
    response.body = response.body ?? {};
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsSingleThreadExecutionRequests = true;

    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArguments
  ): void {
    void this.handleLaunchRequest(response, args);
  }

  private async handleLaunchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArguments
  ): Promise<void> {
    this.haltNotified = false;
    this.breakpoints.clear();
    this.runtime = undefined;
    this.listing = undefined;
    this.listingPath = undefined;
    this.terminalState = undefined;

    try {
      const merged = this.populateFromConfig(args);
      this.stopOnEntry = merged.stopOnEntry !== false;

      if (
        (merged.asm === undefined || merged.asm === '') &&
        (merged.hex === undefined || merged.hex === '') &&
        (merged.listing === undefined || merged.listing === '')
      ) {
        const created = await this.promptForConfigCreation(args);
        if (created) {
          this.sendErrorResponse(
            response,
            1,
            'Debug80: Created debug80.json. Set up your default target and re-run.'
          );
          return;
        }
        this.sendErrorResponse(
          response,
          1,
          'Debug80: No asm/hex/listing provided and no debug80.json found. Add debug80.json or specify paths.'
        );
        return;
      }

      const baseDir = this.resolveBaseDir(merged);
      const { hexPath, listingPath, asmPath } = this.resolveArtifacts(merged, baseDir);

      this.assembleIfRequested(merged, asmPath, hexPath, listingPath);

      if (!fs.existsSync(hexPath) || !fs.existsSync(listingPath)) {
        const created = await this.promptForConfigCreation(args);
        if (created) {
          this.sendErrorResponse(
            response,
            1,
            'Debug80: Created debug80.json. Re-run the launch after building artifacts.'
          );
          return;
        }
        this.sendErrorResponse(
          response,
          1,
          `Z80 artifacts not found. Expected HEX at "${hexPath}" and LST at "${listingPath}".`
        );
        return;
      }

      const hexContent = fs.readFileSync(hexPath, 'utf-8');
      const program = parseIntelHex(hexContent);

      const listingContent = fs.readFileSync(listingPath, 'utf-8');
      this.listing = parseListing(listingContent);
      this.listingPath = listingPath;
      this.sourceFile = listingPath;

      const ioHandlers = this.buildIoHandlers(merged);
      this.runtime = createZ80Runtime(program, merged.entry, ioHandlers);
      if (this.listing !== undefined) {
        const applied = this.applyBreakpoints(this.pendingBreakpoints);
        for (const bp of applied) {
          this.sendEvent(new BreakpointEvent('changed', bp));
        }
      }

      this.sendResponse(response);

      if (this.stopOnEntry) {
        this.sendEvent(new StoppedEvent('entry', THREAD_ID));
      }
    } catch (err) {
      this.sendErrorResponse(response, 1, `Failed to load program: ${String(err)}`);
    }
  }

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    this.pendingBreakpoints = args.breakpoints ?? [];

    const verified =
      this.listing !== undefined ? this.applyBreakpoints(this.pendingBreakpoints) : this.pendingBreakpoints.map((bp) => ({ line: bp.line, verified: false }));
    response.body = { breakpoints: verified };
    this.sendResponse(response);
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this.sendResponse(response);

    if (!this.stopOnEntry) {
      this.runUntilStop();
    }
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(THREAD_ID, 'Main Thread')],
    };
    this.sendResponse(response);
  }

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments
  ): void {
    this.continueExecution(response);
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments
  ): void {
    if (this.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const result = this.runtime.step();
    this.sendResponse(response);

    if (result.halted) {
      this.handleHaltStop();
    } else {
      this.haltNotified = false;
      this.sendEvent(new StoppedEvent('step', THREAD_ID));
    }
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    args: DebugProtocol.StepInArguments
  ): void {
    this.nextRequest(response, args);
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    args: DebugProtocol.StepOutArguments
  ): void {
    this.nextRequest(response, args);
  }

  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments
  ): void {
    this.sendResponse(response);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments
  ): void {
    if (this.runtime === undefined) {
      response.body = { stackFrames: [], totalFrames: 0 };
      this.sendResponse(response);
      return;
    }

    const sourcePath = this.listingPath ?? this.sourceFile;
    const lineFromMap = this.listing?.addressToLine.get(this.runtime.getPC()) ?? 1;
    const source = new Source(path.basename(sourcePath), sourcePath);

    response.body = {
      stackFrames: [new StackFrame(0, 'main', source, lineFromMap)],
      totalFrames: 1,
    };

    this.sendResponse(response);
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments
  ): void {
    const registersRef = this.variableHandles.create('registers');
    response.body = {
      scopes: [new Scope('Registers', registersRef, false)],
    };
    this.sendResponse(response);
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    const scopeType = this.variableHandles.get(args.variablesReference);

    if (scopeType === 'registers' && this.runtime !== undefined) {
      const regs = this.runtime.getRegisters();
      const flagByte =
        (regs.flags.S << 7) |
        (regs.flags.Z << 6) |
        (regs.flags.Y << 5) |
        (regs.flags.H << 4) |
        (regs.flags.X << 3) |
        (regs.flags.P << 2) |
        (regs.flags.N << 1) |
        regs.flags.C;
      const flagBytePrime =
        (regs.flags_prime.S << 7) |
        (regs.flags_prime.Z << 6) |
        (regs.flags_prime.Y << 5) |
        (regs.flags_prime.H << 4) |
        (regs.flags_prime.X << 3) |
        (regs.flags_prime.P << 2) |
        (regs.flags_prime.N << 1) |
        regs.flags_prime.C;

      const fmt16 = (v: number) => `0x${v.toString(16).padStart(4, '0')}`;
      const fmt8 = (v: number) => `0x${v.toString(16).padStart(2, '0')}`;
      const flagsStr = (f: { S: number; Z: number; Y: number; H: number; X: number; P: number; N: number; C: number }) => {
        const letters: [keyof typeof f, string][] = [
          ['S', 's'],
          ['Z', 'z'],
          ['Y', 'y'],
          ['H', 'h'],
          ['X', 'x'],
          ['P', 'p'],
          ['N', 'n'],
          ['C', 'c'],
        ];
        return letters.map(([k, ch]) => (f[k] ? ch.toUpperCase() : ch)).join('');
      };

      const af = ((regs.a & 0xff) << 8) | (flagByte & 0xff);
      const bc = ((regs.b & 0xff) << 8) | (regs.c & 0xff);
      const de = ((regs.d & 0xff) << 8) | (regs.e & 0xff);
      const hl = ((regs.h & 0xff) << 8) | (regs.l & 0xff);
      const afp = ((regs.a_prime & 0xff) << 8) | (flagBytePrime & 0xff);
      const bcp = ((regs.b_prime & 0xff) << 8) | (regs.c_prime & 0xff);
      const dep = ((regs.d_prime & 0xff) << 8) | (regs.e_prime & 0xff);
      const hlp = ((regs.h_prime & 0xff) << 8) | (regs.l_prime & 0xff);

      response.body = {
        variables: [
          { name: 'Flags', value: flagsStr(regs.flags), variablesReference: 0 },
          { name: 'PC', value: fmt16(this.runtime.getPC()), variablesReference: 0 },
          { name: 'SP', value: fmt16(regs.sp), variablesReference: 0 },

          { name: 'AF', value: fmt16(af), variablesReference: 0 },
          { name: 'BC', value: fmt16(bc), variablesReference: 0 },
          { name: 'DE', value: fmt16(de), variablesReference: 0 },
          { name: 'HL', value: fmt16(hl), variablesReference: 0 },

          { name: "AF'", value: fmt16(afp), variablesReference: 0 },
          { name: "BC'", value: fmt16(bcp), variablesReference: 0 },
          { name: "DE'", value: fmt16(dep), variablesReference: 0 },
          { name: "HL'", value: fmt16(hlp), variablesReference: 0 },

          { name: 'IX', value: fmt16(regs.ix), variablesReference: 0 },
          { name: 'IY', value: fmt16(regs.iy), variablesReference: 0 },

          { name: 'I', value: fmt8(regs.i), variablesReference: 0 },
          { name: 'R', value: fmt8(regs.r), variablesReference: 0 },
        ],
      };
    } else {
      response.body = { variables: [] };
    }

    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments
  ): void {
    this.runtime = undefined;
    this.haltNotified = false;
    this.terminalState = undefined;
    this.sendResponse(response);
  }

  protected customRequest(
    command: string,
    response: DebugProtocol.Response,
    args: unknown
  ): void {
    if (command === 'debug80/terminalInput') {
      if (this.terminalState === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
        return;
      }
      const payload = args as { text?: unknown };
      const textValue = typeof payload.text === 'string' ? payload.text : '';
      const bytes = Array.from(textValue, (ch) => ch.charCodeAt(0) & 0xff);
      this.terminalState.input.push(...bytes);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/terminalBreak') {
      if (this.terminalState === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
        return;
      }
      this.terminalState.breakRequested = true;
      this.sendResponse(response);
      return;
    }

    super.customRequest(command, response, args);
  }

  private continueExecution(response: DebugProtocol.Response): void {
    if (this.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    this.sendResponse(response);
    this.runUntilStop();
  }

  private runUntilStop(): void {
    void this.runUntilStopAsync();
  }

  private handleHaltStop(): void {
    if (!this.haltNotified) {
      this.haltNotified = true;
      this.sendEvent(new StoppedEvent('halt', THREAD_ID));
      return;
    }

    this.sendEvent(new TerminatedEvent());
  }

  private async runUntilStopAsync(): Promise<void> {
    if (this.runtime === undefined) {
      return;
    }
    const CHUNK = 500;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (let i = 0; i < CHUNK; i += 1) {
        if (this.runtime === undefined) {
          return;
        }
        if (this.breakpoints.has(this.runtime.getPC())) {
          this.haltNotified = false;
          this.sendEvent(new StoppedEvent('breakpoint', THREAD_ID));
          return;
        }
        const result = this.runtime.step();
        if (result.halted) {
          this.handleHaltStop();
          return;
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  private populateFromConfig(args: LaunchRequestArguments): LaunchRequestArguments {
    const configCandidates: string[] = [];

    if (args.projectConfig !== undefined && args.projectConfig !== '') {
      configCandidates.push(args.projectConfig);
    }
    configCandidates.push('debug80.json');
    configCandidates.push('.debug80.json');
    configCandidates.push(path.join('.vscode', 'debug80.json'));

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const startDir =
      args.asm !== undefined && args.asm !== ''
        ? path.dirname(args.asm)
        : args.sourceFile !== undefined && args.sourceFile !== ''
        ? path.dirname(args.sourceFile)
        : workspaceRoot ?? process.cwd();

    const dirsToCheck: string[] = [];
    for (let dir = startDir; ; ) {
      dirsToCheck.push(dir);
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }

    let configPath: string | undefined;
    for (const dir of dirsToCheck) {
      for (const candidate of configCandidates) {
        const full = path.isAbsolute(candidate) ? candidate : path.join(dir, candidate);
        if (fs.existsSync(full)) {
          configPath = full;
          break;
        }
      }
      if (configPath !== undefined) {
        break;
      }
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
          if (pkg.debug80 !== undefined) {
            configPath = pkgPath;
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (configPath === undefined) {
      return args;
    }

    try {
      let cfg: {
        defaultTarget?: string;
        targets?: Record<string, Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string }>;
      } & (Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string });

      if (configPath.endsWith('package.json')) {
        const pkgRaw = fs.readFileSync(configPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
        cfg =
          (pkg.debug80 as typeof cfg) ??
          ({
            targets: {},
          } as typeof cfg);
      } else {
        const raw = fs.readFileSync(configPath, 'utf-8');
        cfg = JSON.parse(raw) as typeof cfg;
      }

      const targets = cfg.targets ?? {};
      const targetName =
        args.target ?? cfg.target ?? cfg.defaultTarget ?? Object.keys(targets)[0];
      const targetCfg =
        (targetName !== undefined ? targets[targetName] : undefined) ??
        undefined;

      const merged: LaunchRequestArguments = {
        ...cfg,
        ...targetCfg,
        ...args,
      };

      const asmResolved =
        args.asm ??
        args.sourceFile ??
        targetCfg?.asm ??
        targetCfg?.sourceFile ??
        targetCfg?.source ??
        cfg.asm ??
        cfg.sourceFile ??
        cfg.source;
      if (asmResolved !== undefined) {
        merged.asm = asmResolved;
      }

      const sourceResolved =
        args.sourceFile ??
        args.asm ??
        targetCfg?.sourceFile ??
        targetCfg?.asm ??
        targetCfg?.source ??
        cfg.sourceFile ??
        cfg.asm ??
        cfg.source;
      if (sourceResolved !== undefined) {
        merged.sourceFile = sourceResolved;
      }

      const hexResolved = args.hex ?? targetCfg?.hex ?? cfg.hex;
      if (hexResolved !== undefined) {
        merged.hex = hexResolved;
      }

      const listingResolved = args.listing ?? targetCfg?.listing ?? cfg.listing;
      if (listingResolved !== undefined) {
        merged.listing = listingResolved;
      }

      const outputDirResolved = args.outputDir ?? targetCfg?.outputDir ?? cfg.outputDir;
      if (outputDirResolved !== undefined) {
        merged.outputDir = outputDirResolved;
      }

      const artifactResolved = args.artifactBase ?? targetCfg?.artifactBase ?? cfg.artifactBase;
      if (artifactResolved !== undefined) {
        merged.artifactBase = artifactResolved;
      }

      const entryResolved = args.entry ?? targetCfg?.entry ?? cfg.entry;
      if (entryResolved !== undefined) {
        merged.entry = entryResolved;
      }

      const stopOnEntryResolved = args.stopOnEntry ?? targetCfg?.stopOnEntry ?? cfg.stopOnEntry;
      if (stopOnEntryResolved !== undefined) {
        merged.stopOnEntry = stopOnEntryResolved;
      }

      const assembleResolved = args.assemble ?? targetCfg?.assemble ?? cfg.assemble;
      if (assembleResolved !== undefined) {
        merged.assemble = assembleResolved;
      }

      const targetResolved = targetName ?? args.target;
      if (targetResolved !== undefined) {
        merged.target = targetResolved;
      }

      return merged;
    } catch {
      return args;
    }
  }

  private async promptForConfigCreation(_args: LaunchRequestArguments): Promise<boolean> {
    const created = await vscode.commands.executeCommand<boolean>('debug80.createProject');
    return Boolean(created);
  }

  private assembleIfRequested(
    args: LaunchRequestArguments,
    asmPath: string | undefined,
    hexPath: string,
    listingPath: string
  ): void {
    if (asmPath === undefined || asmPath === '' || args.assemble === false) {
      return;
    }

    const asmDir = path.dirname(asmPath);
    const outDir = path.dirname(hexPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const command = this.findAsm80Binary(asmDir) ?? 'asm80';
    const outArg = path.relative(asmDir, hexPath);
    const result = cp.spawnSync(
      command,
      ['-m', 'Z80', '-t', 'hex', '-o', outArg, path.basename(asmPath)],
      {
        cwd: asmDir,
        encoding: 'utf-8',
      }
    );

    if (result.error) {
      const enoent = (result.error as NodeJS.ErrnoException)?.code === 'ENOENT';
      const message = enoent
        ? 'asm80 not found. Install it with "npm install -D asm80" or ensure it is on PATH.'
        : `asm80 failed to start: ${result.error.message ?? String(result.error)}`;
      throw new Error(message);
    }

    if (result.status !== 0) {
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      const suffix = output.length > 0 ? `: ${output}` : '';
      throw new Error(`asm80 exited with code ${result.status}${suffix}`);
    }

    const producedListing = path.join(
      path.dirname(hexPath),
      `${path.basename(hexPath, path.extname(hexPath))}.lst`
    );
    if (listingPath !== producedListing && fs.existsSync(producedListing)) {
      const listingDir = path.dirname(listingPath);
      if (!fs.existsSync(listingDir)) {
        fs.mkdirSync(listingDir, { recursive: true });
      }
      fs.copyFileSync(producedListing, listingPath);
    }
  }

  private buildIoHandlers(args: LaunchRequestArguments): IoHandlers | undefined {
    const cfg = args.terminal;
    if (cfg === undefined) {
      return undefined;
    }
    const config: TerminalConfigNormalized = {
      txPort: cfg.txPort ?? 0,
      rxPort: cfg.rxPort ?? 1,
      statusPort: cfg.statusPort ?? 2,
      interrupt: cfg.interrupt ?? false,
    };
    this.terminalState = { config, input: [] };
    const ioHandlers: IoHandlers = {
      read: (port: number): number => {
        const p = port & 0xff;
        const term = this.terminalState;
        if (term !== undefined) {
          if (p === term.config.rxPort) {
            const value = term.input.shift();
            return value ?? 0;
          }
          if (p === term.config.statusPort) {
            const rxAvail = term.input.length > 0 ? 1 : 0;
            const txReady = 0b10;
            return rxAvail | txReady;
          }
        }
        return 0;
      },
      write: (port: number, value: number): void => {
        const p = port & 0xff;
        const term = this.terminalState;
        if (term !== undefined && p === term.config.txPort) {
          const byte = value & 0xff;
          const ch = String.fromCharCode(byte);
          this.sendEvent(new DapEvent('debug80/terminalOutput', { text: ch }));
        }
      },
      tick: (): { interrupt?: { nonMaskable?: boolean; data?: number } } | void => {
        const term = this.terminalState;
        if (term !== undefined && term.breakRequested) {
          term.breakRequested = false;
          return { interrupt: { nonMaskable: false, data: 0x38 } };
        }
        return undefined;
      },
    };

    return ioHandlers;
  }

  private findAsm80Binary(startDir: string): string | undefined {
    const candidates =
      process.platform === 'win32'
        ? ['asm80.cmd', 'asm80.exe', 'asm80.ps1', 'asm80']
        : ['asm80'];

    for (let dir = startDir; ; ) {
      const binDir = path.join(dir, 'node_modules', '.bin');
      for (const name of candidates) {
        const candidate = path.join(binDir, name);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }

    const bundled = this.resolveBundledAsm80();
    if (bundled !== undefined) {
      return bundled;
    }

    return undefined;
  }

  private applyBreakpoints(bps: DebugProtocol.SourceBreakpoint[]): DebugProtocol.Breakpoint[] {
    const listing = this.listing;
    const listingPath = this.listingPath;
    const verified: DebugProtocol.Breakpoint[] = [];

    if (listing === undefined || listingPath === undefined) {
      for (const bp of bps) {
        verified.push({ line: bp.line, verified: false });
      }
      return verified;
    }

    this.breakpoints.clear();
    for (const bp of bps) {
      const line = bp.line ?? 0;
      const address =
        listing.lineToAddress.get(line) ??
        listing.lineToAddress.get(line + 1); // tolerate 0-based incoming lines
      const ok = address !== undefined;
      if (ok && address !== undefined) {
        this.breakpoints.add(address);
      }
      verified.push({
        line: bp.line,
        verified: ok,
      });
    }

    return verified;
  }

  private resolveBundledAsm80(): string | undefined {
    const tryResolve = (id: string): string | undefined => {
      try {
        return require.resolve(id);
      } catch {
        return undefined;
      }
    };

    const direct = tryResolve('asm80/bin/asm80') ?? tryResolve('asm80/bin/asm80.js');
    if (direct !== undefined) {
      return direct;
    }

    const pkg = tryResolve('asm80/package.json');
    if (pkg !== undefined) {
      const root = path.dirname(pkg);
      const bin = path.join(root, 'bin', 'asm80');
      if (fs.existsSync(bin)) {
        return bin;
      }
      const binJs = `${bin}.js`;
      if (fs.existsSync(binJs)) {
        return binJs;
      }
    }

    return undefined;
  }

  private resolveBaseDir(args: LaunchRequestArguments): string {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // If a projectConfig is provided, use the workspace root when the config lives inside it
    // (including .vscode), otherwise fall back to the config directory.
    if (args.projectConfig !== undefined && args.projectConfig !== '') {
      const cfgPath = path.isAbsolute(args.projectConfig)
        ? args.projectConfig
        : workspace !== undefined
        ? path.join(workspace, args.projectConfig)
        : args.projectConfig;

      if (workspace !== undefined && cfgPath.startsWith(workspace)) {
        return workspace;
      }

      return path.dirname(cfgPath);
    }

    return workspace ?? process.cwd();
  }

  private resolveAsmPath(asm: string | undefined, baseDir: string): string | undefined {
    if (asm === undefined || asm === '') {
      return undefined;
    }
    if (path.isAbsolute(asm)) {
      return asm;
    }
    return path.resolve(baseDir, asm);
  }

  private resolveRelative(p: string, baseDir: string): string {
    if (path.isAbsolute(p)) {
      return p;
    }
    return path.resolve(baseDir, p);
  }

  private resolveArtifacts(
    args: LaunchRequestArguments,
    baseDir: string
  ): { hexPath: string; listingPath: string; asmPath?: string | undefined } {
    const asmPath = this.resolveAsmPath(args.asm, baseDir);

    let hexPath = args.hex;
    let listingPath = args.listing;

    const hexMissing = hexPath === undefined || hexPath === '';
    const listingMissing = listingPath === undefined || listingPath === '';

    if (hexMissing || listingMissing) {
      if (asmPath === undefined || asmPath === '') {
        throw new Error('Z80 runtime requires "asm" (root asm file) or explicit "hex" and "listing" paths.');
      }
      const artifactBase = args.artifactBase ?? path.basename(asmPath, path.extname(asmPath));
      const outDirRaw = args.outputDir ?? path.dirname(asmPath);
      const outDir = this.resolveRelative(outDirRaw, baseDir);
      hexPath = path.join(outDir, `${artifactBase}.hex`);
      listingPath = path.join(outDir, `${artifactBase}.lst`);
    }

    if (
      hexPath === undefined ||
      listingPath === undefined ||
      hexPath === '' ||
      listingPath === ''
    ) {
      throw new Error('Z80 runtime requires resolvable HEX and LST paths.');
    }

    const hexAbs = this.resolveRelative(hexPath, baseDir);
    const listingAbs = this.resolveRelative(listingPath, baseDir);

    return { hexPath: hexAbs, listingPath: listingAbs, asmPath };
  }
}

export class Z80DebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new Z80DebugSession());
  }
}
