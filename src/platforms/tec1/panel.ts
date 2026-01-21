import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Tec1SpeedMode, Tec1UpdatePayload } from './types';

interface Tec1ProgramSpec {
  id: string;
  name: string;
  dir: string;
  asm: string;
  rom?: string;
  romHex?: string;
  org?: number;
  entry?: number;
  description?: string;
}

export interface Tec1PanelController {
  open(session?: vscode.DebugSession, options?: { focus?: boolean; reveal?: boolean }): void;
  update(payload: Tec1UpdatePayload): void;
  appendSerial(text: string): void;
  clear(): void;
  handleSessionTerminated(sessionId: string): void;
}

export function createTec1PanelController(
  getTargetColumn: () => vscode.ViewColumn,
  getFallbackSession: () => vscode.DebugSession | undefined
): Tec1PanelController {
  let panel: vscode.WebviewPanel | undefined;
  let session: vscode.DebugSession | undefined;
  let digits = Array.from({ length: 6 }, () => 0);
  let matrix = Array.from({ length: 8 }, () => 0);
  let speaker = false;
  let speedMode: Tec1SpeedMode = 'fast';
  let lcd = Array.from({ length: 32 }, () => 0x20);
  let serialBuffer = '';
  const serialMaxChars = 8000;
  let programs: Tec1ProgramSpec[] = [];
  let programById = new Map<string, Tec1ProgramSpec>();

  const parseProgramNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  };

  const resolveExtensionPath = (): string | undefined => {
    const extension = vscode.extensions.getExtension('jhlagado.debug80');
    if (!extension) {
      return undefined;
    }
    return extension.extensionPath;
  };

  const loadProgramsFromRoot = (root: string, prefix: string): Tec1ProgramSpec[] => {
    if (!fs.existsSync(root)) {
      return [];
    }
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const programs: Tec1ProgramSpec[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const dir = path.join(root, entry.name);
      const manifestPath = path.join(dir, 'program.json');
      let manifest: Record<string, unknown> = {};
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          manifest = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          manifest = {};
        }
      }
      const id = `${prefix}-${entry.name}`;
      const name = typeof manifest.name === 'string' ? manifest.name : entry.name;
      const asm = typeof manifest.asm === 'string' ? manifest.asm : 'main.asm';
      const resolvedAsm = path.isAbsolute(asm) ? asm : path.join(dir, asm);
      if (!fs.existsSync(resolvedAsm)) {
        continue;
      }
      const spec: Tec1ProgramSpec = {
        id,
        name,
        dir,
        asm: resolvedAsm,
      };
      const rom = typeof manifest.rom === 'string' ? manifest.rom : undefined;
      if (rom) {
        spec.rom = rom;
      }
      const romHex = typeof manifest.romHex === 'string' ? manifest.romHex : undefined;
      if (romHex) {
        spec.romHex = romHex;
      }
      const org = parseProgramNumber(manifest.org);
      if (org !== undefined) {
        spec.org = org;
      }
      const entryValue = parseProgramNumber(manifest.entry);
      if (entryValue !== undefined) {
        spec.entry = entryValue;
      }
      const description = typeof manifest.description === 'string' ? manifest.description : undefined;
      if (description) {
        spec.description = description;
      }
      programs.push(spec);
    }
    return programs;
  };

  const loadTec1Programs = (): Tec1ProgramSpec[] => {
    const list: Tec1ProgramSpec[] = [];
    const extensionRoot = resolveExtensionPath();
    if (extensionRoot) {
      list.push(
        ...loadProgramsFromRoot(
          path.join(extensionRoot, 'programs', 'tec1', 'bundled'),
          'bundled'
        )
      );
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      list.push(
        ...loadProgramsFromRoot(
          path.join(workspaceRoot, 'programs', 'tec1', 'user'),
          'user'
        )
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  };

  const updateProgramList = (): void => {
    programs = loadTec1Programs();
    programById = new Map(programs.map((program) => [program.id, program]));
  };

  const resolveProgramOutputDir = (program: Tec1ProgramSpec): string => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot && program.dir.startsWith(workspaceRoot)) {
      return path.join(program.dir, 'build');
    }
    if (workspaceRoot) {
      return path.join(workspaceRoot, '.debug80', 'tec1-programs', program.id);
    }
    return path.join(os.tmpdir(), 'debug80', 'tec1-programs', program.id);
  };

  const loadProgramIntoSession = async (programId: string): Promise<void> => {
    const program = programById.get(programId);
    if (!program) {
      vscode.window.showErrorMessage('Debug80: program not found.');
      return;
    }
    const target = session ?? getFallbackSession();
    if (target?.type !== 'z80') {
      vscode.window.showErrorMessage('Debug80: no active TEC-1 debug session.');
      return;
    }
    const outputDir = resolveProgramOutputDir(program);
    try {
      await target.customRequest('debug80/tec1LoadProgram', {
        asmPath: program.asm,
        outputDir,
        artifactBase: program.id,
        sourceRoots: [program.dir],
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Debug80: program load failed. ${String(err)}`);
    }
  };

  const open = (
    targetSession?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean }
  ): void => {
    const focus = options?.focus ?? false;
    const reveal = options?.reveal ?? true;
    const targetColumn = getTargetColumn();
    if (panel === undefined) {
      panel = vscode.window.createWebviewPanel(
        'debug80Tec1',
        'Debug80 TEC-1',
        targetColumn,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.onDidDispose(() => {
        panel = undefined;
        session = undefined;
        digits = Array.from({ length: 6 }, () => 0);
        matrix = Array.from({ length: 8 }, () => 0);
        speaker = false;
        speedMode = 'slow';
        lcd = Array.from({ length: 32 }, () => 0x20);
      });
      panel.webview.onDidReceiveMessage(
        async (msg: {
          type?: string;
          code?: number;
          mode?: Tec1SpeedMode;
          text?: string;
          id?: string;
        }) => {
          if (msg.type === 'key' && typeof msg.code === 'number') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1Key', { code: msg.code });
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'reset') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1Reset', {});
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'speed' && (msg.mode === 'slow' || msg.mode === 'fast')) {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1Speed', { mode: msg.mode });
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'serialSend' && typeof msg.text === 'string') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1SerialInput', { text: msg.text });
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'programLoad' && typeof msg.id === 'string') {
            await loadProgramIntoSession(msg.id);
          }
        }
      );
    }
    if (targetSession !== undefined) {
      session = targetSession;
    }
    if (reveal) {
      panel.reveal(targetColumn, !focus);
    }
    updateProgramList();
    panel.webview.html = getTec1Html();
    update({ digits, matrix, speaker: speaker ? 1 : 0, speedMode, lcd });
    if (serialBuffer.length > 0) {
      panel.webview.postMessage({ type: 'serialInit', text: serialBuffer });
    }
    panel.webview.postMessage({ type: 'programs', programs });
  };

  const update = (payload: Tec1UpdatePayload): void => {
    digits = payload.digits.slice(0, 6);
    matrix = payload.matrix.slice(0, 8);
    speaker = payload.speaker === 1;
    speedMode = payload.speedMode;
    lcd = payload.lcd.slice(0, 32);
    if (panel !== undefined) {
      panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        speaker,
        speedMode,
        lcd,
        speakerHz: payload.speakerHz,
      });
    }
  };

  const appendSerial = (text: string): void => {
    if (!text) {
      return;
    }
    serialBuffer += text;
    if (serialBuffer.length > serialMaxChars) {
      serialBuffer = serialBuffer.slice(serialBuffer.length - serialMaxChars);
    }
    if (panel !== undefined) {
      panel.webview.postMessage({ type: 'serial', text });
    }
  };

  const clear = (): void => {
    digits = Array.from({ length: 6 }, () => 0);
    matrix = Array.from({ length: 8 }, () => 0);
    speaker = false;
    lcd = Array.from({ length: 32 }, () => 0x20);
    serialBuffer = '';
    if (panel !== undefined) {
      panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        speaker: false,
        speedMode,
        lcd,
      });
      panel.webview.postMessage({ type: 'serialClear' });
    }
  };

  const handleSessionTerminated = (sessionId: string): void => {
    if (session?.id === sessionId) {
      session = undefined;
      clear();
    }
  };

  return {
    open,
    update,
    appendSerial,
    clear,
    handleSessionTerminated,
  };
}

function getTec1Html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, sans-serif;
      background: #1c1c1c;
      color: #f0f0f0;
    }
    #app {
      outline: none;
    }
    .layout {
      display: grid;
      grid-template-columns: auto 260px;
      gap: 16px;
      align-items: start;
    }
    .left-col,
    .right-col {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .display {
      display: flex;
      flex-direction: row-reverse;
      gap: 10px;
      padding: 12px;
      background: #101010;
      border-radius: 8px;
      width: fit-content;
    }
    .digit svg {
      width: 36px;
      height: 60px;
    }
    .seg {
      fill: #320000;
    }
    .seg.on {
      fill: #ff3b3b;
    }
    .speaker {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      background: #333;
      font-size: 12px;
      letter-spacing: 0.08em;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .speaker.on {
      background: #ffb000;
      color: #000;
    }
    .status {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .key.speed {
      padding: 4px 10px;
      font-size: 12px;
      letter-spacing: 0.08em;
      min-width: 60px;
    }
    .key.mute {
      padding: 4px 10px;
      font-size: 12px;
      letter-spacing: 0.08em;
      min-width: 80px;
    }
    .keypad {
      display: grid;
      grid-template-columns: 56px repeat(4, 48px);
      gap: 8px;
      align-items: center;
    }
    .controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-right: 8px;
    }
    .key {
      background: #2b2b2b;
      border: 1px solid #444;
      border-radius: 6px;
      color: #fff;
      padding: 6px 0;
      text-align: center;
      cursor: pointer;
      user-select: none;
      font-size: 12px;
    }
    .key:active {
      background: #3a3a3a;
    }
    .key.active {
      background: #505050;
      border-color: #6a6a6a;
    }
    .key.spacer {
      background: transparent;
      border-color: transparent;
      cursor: default;
    }
    .key.shift {
      letter-spacing: 0.08em;
    }
    .serial {
      margin-top: 16px;
      background: #101010;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .lcd {
      margin-top: 0;
      background: #0f1f13;
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #213826;
      width: fit-content;
    }
    .matrix {
      margin-top: 12px;
      background: #1b0b0b;
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #3b1212;
      width: fit-content;
    }
    .matrix-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #e0b0b0;
      margin-bottom: 8px;
    }
    .matrix-grid {
      display: grid;
      grid-template-columns: repeat(8, 18px);
      grid-template-rows: repeat(8, 18px);
      gap: 6px;
      background: #120707;
      padding: 8px;
      border-radius: 6px;
      border: 1px solid #2f1111;
    }
    .matrix-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #6b1515, #3a0a0a 70%);
      box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.6);
    }
    .matrix-dot.on {
      background: radial-gradient(circle at 30% 30%, #ff6b6b, #c01010 70%);
      box-shadow: 0 0 8px rgba(255, 60, 60, 0.6);
    }
    .programs-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #0f1012;
      border-radius: 8px;
      padding: 8px 12px;
      border: 1px solid #2a2c30;
      margin-bottom: 12px;
      flex-wrap: nowrap;
    }
    .programs-title {
      font-size: 11px;
      letter-spacing: 0.08em;
      color: #b4b4b4;
      white-space: nowrap;
    }
    .programs-bar select {
      min-width: 220px;
      flex: 1 1 auto;
      background: #141619;
      border: 1px solid #2a2c30;
      border-radius: 6px;
      color: #f0f0f0;
      padding: 6px 8px;
      font-size: 12px;
    }
    .programs-meta {
      font-size: 11px;
      color: #8e8e8e;
      white-space: nowrap;
    }
    .lcd-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #9bbfa0;
      margin-bottom: 6px;
    }
    .lcd-canvas {
      display: block;
      background: #0b1a10;
      border-radius: 4px;
      image-rendering: pixelated;
    }
    .serial-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #c0c0c0;
      margin-bottom: 6px;
    }
    .serial-body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
        'Courier New', monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 160px;
      overflow-y: auto;
    }
    .serial-input {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .serial-input input {
      flex: 1;
      background: #0b0b0b;
      border: 1px solid #333;
      border-radius: 6px;
      color: #f0f0f0;
      padding: 6px 8px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
        'Courier New', monospace;
    }
    .serial-input input:focus {
      outline: 1px solid #555;
    }
  </style>
</head>
<body>
  <div id="app" tabindex="0">
    <div class="programs-bar">
      <div class="programs-title">PROGRAM</div>
      <select id="programSelect"></select>
      <div class="programs-meta" id="programMeta"></div>
      <div class="key" id="programLoad">LOAD</div>
    </div>
    <div class="layout">
      <div class="left-col">
        <div class="display" id="display"></div>
        <div class="status">
          <div class="speaker" id="speaker">
            <span>SPEAKER</span>
            <span id="speakerHz"></span>
          </div>
          <div class="key speed" id="speed">SLOW</div>
          <div class="key mute" id="mute">MUTED</div>
        </div>
        <div class="keypad" id="keypad"></div>
      </div>
      <div class="right-col">
        <div class="lcd">
          <div class="lcd-title">LCD (HD44780 A00)</div>
          <canvas class="lcd-canvas" id="lcdCanvas" width="224" height="40"></canvas>
        </div>
        <div class="matrix">
          <div class="matrix-title">8x8 LED MATRIX</div>
          <div class="matrix-grid" id="matrixGrid"></div>
        </div>
      </div>
    </div>
    <div class="serial">
      <div class="serial-title">SERIAL (BIT 6)</div>
      <pre class="serial-body" id="serialOut"></pre>
      <div class="serial-input">
        <input id="serialInput" type="text" placeholder="Type and press Enter (CR)..." />
        <div class="key" id="serialSend">SEND</div>
      </div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const displayEl = document.getElementById('display');
    const keypadEl = document.getElementById('keypad');
    const speakerEl = document.getElementById('speaker');
    const speakerHzEl = document.getElementById('speakerHz');
    const speedEl = document.getElementById('speed');
    const muteEl = document.getElementById('mute');
    const serialOutEl = document.getElementById('serialOut');
    const serialInputEl = document.getElementById('serialInput');
    const serialSendEl = document.getElementById('serialSend');
    const lcdCanvas = document.getElementById('lcdCanvas');
    const lcdCtx = lcdCanvas && lcdCanvas.getContext ? lcdCanvas.getContext('2d') : null;
    const matrixGrid = document.getElementById('matrixGrid');
    const programSelect = document.getElementById('programSelect');
    const programLoad = document.getElementById('programLoad');
    const programMeta = document.getElementById('programMeta');
    const SERIAL_MAX = 8000;
    const SHIFT_BIT = 0x20;
    const DIGITS = 6;
    const LCD_COLS = 16;
    const LCD_ROWS = 2;
    const LCD_CELL_W = 14;
    const LCD_CELL_H = 20;
    let lcdBytes = new Array(LCD_COLS * LCD_ROWS).fill(0x20);
    let matrixRows = new Array(8).fill(0);
    let programs = [];
    const SEGMENTS = [
      { mask: 0x01, points: '1,1 2,0 8,0 9,1 8,2 2,2' },
      { mask: 0x08, points: '9,1 10,2 10,8 9,9 8,8 8,2' },
      { mask: 0x20, points: '9,9 10,10 10,16 9,17 8,16 8,10' },
      { mask: 0x80, points: '9,17 8,18 2,18 1,17 2,16 8,16' },
      { mask: 0x40, points: '1,17 0,16 0,10 1,9 2,10 2,16' },
      { mask: 0x02, points: '1,9 0,8 0,2 1,1 2,2 2,8' },
      { mask: 0x04, points: '1,9 2,8 8,8 9,9 8,10 2,10' },
    ];

    function createDigit() {
      const wrapper = document.createElement('div');
      wrapper.className = 'digit';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 -1 12 20');
      SEGMENTS.forEach(seg => {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', seg.points);
        poly.dataset.mask = String(seg.mask);
        poly.classList.add('seg');
        svg.appendChild(poly);
      });
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', '11');
      dot.setAttribute('cy', '17');
      dot.setAttribute('r', '1');
      dot.dataset.mask = '16';
      dot.classList.add('seg');
      svg.appendChild(dot);
      wrapper.appendChild(svg);
      return wrapper;
    }

    const digitEls = [];
    for (let i = 0; i < DIGITS; i++) {
      const digit = createDigit();
      digitEls.push(digit);
      displayEl.appendChild(digit);
    }

    const keyMap = {
      '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
      '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
      'A': 0x0A, 'B': 0x0B, 'C': 0x0C, 'D': 0x0D, 'E': 0x0E, 'F': 0x0F,
      'AD': 0x13, 'UP': 0x10, 'GO': 0x12, 'DOWN': 0x11
    };

    const controlOrder = ['AD', 'GO', 'UP', 'DOWN'];
    const hexOrder = [
      'F', 'E', 'D', 'C',
      'B', 'A', '9', '8',
      '7', '6', '5', '4',
      '3', '2', '1', '0'
    ];

    let speedMode = 'fast';
    let muted = true;
    let lastSpeakerOn = false;
    let lastSpeakerHz = 0;
    let shiftLatched = false;
    let audioCtx = null;
    let osc = null;
    let gain = null;

    function applySpeed(mode) {
      speedMode = mode;
      speedEl.textContent = mode.toUpperCase();
      speedEl.classList.toggle('slow', mode === 'slow');
      speedEl.classList.toggle('fast', mode === 'fast');
    }

    function lcdByteToChar(value) {
      const code = value & 0xff;
      if (code >= 0x20 && code <= 0x7e) {
        return String.fromCharCode(code);
      }
      return ' ';
    }

    function drawLcd() {
      if (!lcdCtx || !lcdCanvas) {
        return;
      }
      lcdCanvas.width = LCD_COLS * LCD_CELL_W;
      lcdCanvas.height = LCD_ROWS * LCD_CELL_H;
      lcdCtx.fillStyle = '#0b1a10';
      lcdCtx.fillRect(0, 0, lcdCanvas.width, lcdCanvas.height);
      lcdCtx.font = '16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      lcdCtx.textBaseline = 'top';
      lcdCtx.fillStyle = '#b4f5b4';
      for (let row = 0; row < LCD_ROWS; row += 1) {
        for (let col = 0; col < LCD_COLS; col += 1) {
          const idx = row * LCD_COLS + col;
          const char = lcdByteToChar(lcdBytes[idx] || 0x20);
          lcdCtx.fillText(char, col * LCD_CELL_W + 2, row * LCD_CELL_H + 2);
        }
      }
    }

    function buildMatrix() {
      if (!matrixGrid) return;
      matrixGrid.innerHTML = '';
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          const dot = document.createElement('div');
          dot.className = 'matrix-dot';
          dot.dataset.row = String(row);
          dot.dataset.col = String(col);
          matrixGrid.appendChild(dot);
        }
      }
    }

    function drawMatrix() {
      if (!matrixGrid) return;
      const dots = matrixGrid.querySelectorAll('.matrix-dot');
      dots.forEach(dot => {
        const row = parseInt(dot.dataset.row || '0', 10);
        const col = parseInt(dot.dataset.col || '0', 10);
        const mask = 1 << col;
        if (matrixRows[row] & mask) {
          dot.classList.add('on');
        } else {
          dot.classList.remove('on');
        }
      });
    }

    function formatHex(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return '';
      }
      return '0x' + value.toString(16).padStart(4, '0');
    }

    function updateProgramMeta() {
      if (!programMeta || !programSelect) return;
      const selected = programs.find(p => p.id === programSelect.value);
      if (!selected) {
        programMeta.textContent = '';
        return;
      }
      const org = formatHex(selected.org);
      const rom = selected.rom ? selected.rom.toUpperCase() : 'MON-1B';
      programMeta.textContent = 'ROM ' + rom + (org ? ' • ORG ' + org : '');
    }

    function renderPrograms(list) {
      if (!programSelect) return;
      programs = Array.isArray(list) ? list : [];
      programSelect.innerHTML = '';
      if (programs.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No programs found';
        programSelect.appendChild(option);
        if (programLoad) {
          programLoad.classList.add('spacer');
        }
        updateProgramMeta();
        return;
      }
      if (programLoad) {
        programLoad.classList.remove('spacer');
      }
      programs.forEach(program => {
        const option = document.createElement('option');
        option.value = program.id;
        option.textContent = program.name;
        programSelect.appendChild(option);
      });
      updateProgramMeta();
    }

    function setShiftLatched(value) {
      shiftLatched = value;
      shiftButton.classList.toggle('active', shiftLatched);
    }

    function ensureAudio() {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
        osc = audioCtx.createOscillator();
        osc.type = 'square';
        gain = audioCtx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }

    function updateAudio() {
      if (!gain || muted || lastSpeakerHz <= 0) {
        if (gain) {
          gain.gain.value = 0;
        }
        return;
      }
      osc.frequency.setValueAtTime(lastSpeakerHz, audioCtx.currentTime);
      gain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.01);
    }

    function applyMuteState() {
      muteEl.textContent = muted ? 'MUTED' : 'SOUND';
      if (muted && gain) {
        gain.gain.value = 0;
      }
      updateAudio();
    }

    function sendKey(code) {
      let adjusted = code;
      if (shiftLatched) {
        adjusted = code & ~SHIFT_BIT;
      } else {
        adjusted = code | SHIFT_BIT;
      }
      vscode.postMessage({ type: 'key', code: adjusted });
      if (shiftLatched) {
        setShiftLatched(false);
      }
    }

    function addButton(label, action, className) {
      const button = document.createElement('div');
      button.className = className ? 'key ' + className : 'key';
      button.textContent = label;
      button.addEventListener('click', action);
      keypadEl.appendChild(button);
      return button;
    }

    addButton('RST', () => {
      setShiftLatched(false);
      vscode.postMessage({ type: 'reset' });
    });
    for (let i = 0; i < 4; i += 1) {
      addButton('', () => {}, 'spacer');
    }

    for (let row = 0; row < 4; row += 1) {
      const control = controlOrder[row];
      addButton(control, () => sendKey(keyMap[control]));
      const rowStart = row * 4;
      for (let col = 0; col < 4; col += 1) {
        const label = hexOrder[rowStart + col];
        addButton(label, () => sendKey(keyMap[label]));
      }
    }

    const shiftButton = addButton('SHIFT', () => {
      setShiftLatched(!shiftLatched);
    }, 'shift');
    speedEl.addEventListener('click', () => {
      const next = speedMode === 'fast' ? 'slow' : 'fast';
      applySpeed(next);
      vscode.postMessage({ type: 'speed', mode: next });
    });
    muteEl.addEventListener('click', () => {
      muted = !muted;
      if (!muted) {
        ensureAudio();
      }
      applyMuteState();
    });

    function updateDigit(el, value) {
      const segments = el.querySelectorAll('[data-mask]');
      segments.forEach(seg => {
        const mask = parseInt(seg.dataset.mask || '0', 10);
        if (value & mask) {
          seg.classList.add('on');
        } else {
          seg.classList.remove('on');
        }
      });
    }

    function applyUpdate(payload) {
      const digits = payload.digits || [];
      digitEls.forEach((el, idx) => {
        updateDigit(el, digits[idx] || 0);
      });
      if (payload.speaker) {
        speakerEl.classList.add('on');
      } else {
        speakerEl.classList.remove('on');
      }
      if (speakerHzEl && typeof payload.speakerHz === 'number') {
        if (payload.speakerHz > 0) {
          speakerHzEl.textContent = payload.speakerHz + ' Hz';
          lastSpeakerHz = payload.speakerHz;
        } else {
          speakerHzEl.textContent = '';
          lastSpeakerHz = 0;
        }
      }
      lastSpeakerOn = !!payload.speaker;
      updateAudio();
      if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
        applySpeed(payload.speedMode);
      }
      if (Array.isArray(payload.lcd)) {
        lcdBytes = payload.lcd.slice(0, LCD_COLS * LCD_ROWS);
        while (lcdBytes.length < LCD_COLS * LCD_ROWS) {
          lcdBytes.push(0x20);
        }
        drawLcd();
      }
      if (Array.isArray(payload.matrix)) {
        matrixRows = payload.matrix.slice(0, 8);
        while (matrixRows.length < 8) {
          matrixRows.push(0);
        }
        drawMatrix();
      }
    }

    function appendSerial(text) {
      if (!text) return;
      const next = (serialOutEl.textContent || '') + text;
      if (next.length > SERIAL_MAX) {
        serialOutEl.textContent = next.slice(next.length - SERIAL_MAX);
      } else {
        serialOutEl.textContent = next;
      }
      serialOutEl.scrollTop = serialOutEl.scrollHeight;
    }

    function sendSerialInput() {
      const text = (serialInputEl.value || '').trimEnd();
      if (!text) return;
      vscode.postMessage({ type: 'serialSend', text: text + '\\r' });
      serialInputEl.value = '';
      serialInputEl.focus();
    }

    window.addEventListener('message', event => {
      if (!event.data) return;
      if (event.data.type === 'update') {
        applyUpdate(event.data);
        return;
      }
      if (event.data.type === 'programs') {
        renderPrograms(event.data.programs || []);
        return;
      }
      if (event.data.type === 'serial') {
        appendSerial(event.data.text || '');
        return;
      }
      if (event.data.type === 'serialInit') {
        serialOutEl.textContent = event.data.text || '';
        return;
      }
      if (event.data.type === 'serialClear') {
        serialOutEl.textContent = '';
      }
    });

    applySpeed(speedMode);
    applyMuteState();
    drawLcd();
    buildMatrix();
    drawMatrix();
    if (document.activeElement !== serialInputEl) {
      document.getElementById('app').focus();
    }

    serialSendEl.addEventListener('click', () => {
      sendSerialInput();
    });
    serialInputEl.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        sendSerialInput();
        event.preventDefault();
      }
    });

    if (programSelect) {
      programSelect.addEventListener('change', () => {
        updateProgramMeta();
      });
    }

    if (programLoad) {
      programLoad.addEventListener('click', () => {
        if (!programSelect || !programSelect.value) return;
        vscode.postMessage({ type: 'programLoad', id: programSelect.value });
      });
    }

    window.addEventListener('keydown', event => {
      if (event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (target && target.isContentEditable) {
        return;
      }
      const key = event.key.toUpperCase();
      if (keyMap[key] !== undefined) {
        sendKey(keyMap[key]);
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter') {
        sendKey(0x12);
        event.preventDefault();
      } else if (event.key === 'ArrowUp') {
        sendKey(0x10);
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        sendKey(0x11);
        event.preventDefault();
      } else if (event.key === 'Tab') {
        sendKey(0x13);
        event.preventDefault();
      }
    });
  </script>
</body>
</html>`;
}
