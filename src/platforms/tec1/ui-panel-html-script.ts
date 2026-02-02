/**
 * @file Tec1 panel HTML script.
 */

/**
 * Returns the TEC-1 panel script block.
 */
export function getTec1Script(activeTab: 'ui' | 'memory'): string {
  return `<script>
    const vscode = acquireVsCodeApi();
    const DEFAULT_TAB = '${activeTab}';
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
    const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
    const panelUi = document.getElementById('panel-ui');
    const panelMemory = document.getElementById('panel-memory');
    const SERIAL_MAX = 8000;
    const SHIFT_BIT = 0x20;
    const DIGITS = 6;
    const LCD_COLS = 16;
    const LCD_ROWS = 2;
    const LCD_CELL_W = 14;
    const LCD_CELL_H = 20;
    let lcdBytes = new Array(LCD_COLS * LCD_ROWS).fill(0x20);
    let matrixRows = new Array(8).fill(0);
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

    let activeTab = DEFAULT_TAB === 'memory' ? 'memory' : 'ui';

    function setTab(tab, notify) {
      activeTab = tab === 'memory' ? 'memory' : 'ui';
      if (panelUi) {
        panelUi.classList.toggle('active', activeTab === 'ui');
      }
      if (panelMemory) {
        panelMemory.classList.toggle('active', activeTab === 'memory');
      }
      tabButtons.forEach((button) => {
        const isActive = button.dataset.tab === activeTab;
        button.classList.toggle('active', isActive);
      });
      if (notify) {
        vscode.postMessage({ type: 'tab', tab: activeTab });
      }
      if (activeTab === 'memory') {
        requestSnapshot();
      }
    }

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (!tab) {
          return;
        }
        setTab(tab, true);
      });
    });

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
    let uiRevision = 0;
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
      if (code === 0x5c) {
        return '¥';
      }
      if (code === 0x7e) {
        return '▶';
      }
      if (code === 0x7f) {
        return '◀';
      }
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

    const statusEl = document.getElementById('status');
    const symbolMap = new Map();
    let symbolsKey = '';
    const views = [
      {
        id: 'a',
        view: document.getElementById('view-a'),
        address: document.getElementById('address-a'),
        after: document.getElementById('after-a'),
        label: document.getElementById('label-a'),
        addr: document.getElementById('addr-a'),
        symbol: document.getElementById('sym-a'),
        dump: document.getElementById('dump-a'),
      },
      {
        id: 'b',
        view: document.getElementById('view-b'),
        address: document.getElementById('address-b'),
        after: document.getElementById('after-b'),
        label: document.getElementById('label-b'),
        addr: document.getElementById('addr-b'),
        symbol: document.getElementById('sym-b'),
        dump: document.getElementById('dump-b'),
      },
      {
        id: 'c',
        view: document.getElementById('view-c'),
        address: document.getElementById('address-c'),
        after: document.getElementById('after-c'),
        label: document.getElementById('label-c'),
        addr: document.getElementById('addr-c'),
        symbol: document.getElementById('sym-c'),
        dump: document.getElementById('dump-c'),
      },
      {
        id: 'd',
        view: document.getElementById('view-d'),
        address: document.getElementById('address-d'),
        after: document.getElementById('after-d'),
        label: document.getElementById('label-d'),
        addr: document.getElementById('addr-d'),
        symbol: document.getElementById('sym-d'),
        dump: document.getElementById('dump-d'),
      },
    ];

    function formatHex(value, width) {
      return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
    }

    function renderDump(el, start, bytes, focusOffset, rowSize) {
      let html = '';
      for (let i = 0; i < bytes.length; i += rowSize) {
        const rowAddr = (start + i) & 0xFFFF;
        html += '<div class="row"><span class="row-addr">' + formatHex(rowAddr, 4) + '</span>';
        let ascii = '';
        for (let j = 0; j < rowSize && i + j < bytes.length; j++) {
          const idx = i + j;
          const value = bytes[idx];
          const cls = idx === focusOffset ? 'byte focus' : 'byte';
          html += '<span class="' + cls + '">' + value.toString(16).toUpperCase().padStart(2, '0') + '</span>';
          ascii += value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';
        }
        html += '<span class="ascii">' + ascii + '</span></div>';
      }
      el.innerHTML = html;
    }

    function parseAddress(text) {
      const trimmed = text.trim();
      if (!trimmed) return undefined;
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('d:')) {
        const value = parseInt(lower.slice(2), 10);
        return Number.isFinite(value) ? value & 0xFFFF : undefined;
      }
      const hexText = lower.startsWith('0x')
        ? lower.slice(2)
        : lower.endsWith('h')
          ? lower.slice(0, -1)
          : lower;
      const value = parseInt(hexText, 16);
      return Number.isFinite(value) ? value & 0xFFFF : undefined;
    }

    function updateSymbolOptions(symbols) {
      if (!Array.isArray(symbols)) {
        return;
      }
      const nextKey = symbols
        .map((sym) =>
          sym && typeof sym.name === 'string' ? sym.name + ':' + String(sym.address) : ''
        )
        .join('|');
      if (nextKey === symbolsKey) {
        return;
      }
      symbolsKey = nextKey;
      symbolMap.clear();
      symbols.forEach((sym) => {
        if (sym && typeof sym.name === 'string' && Number.isFinite(sym.address)) {
          symbolMap.set(sym.name, sym.address & 0xffff);
        }
      });
      views.forEach((entry) => {
        const existing = entry.view.querySelector('optgroup[data-symbols="true"]');
        if (existing) {
          existing.remove();
        }
        if (symbolMap.size === 0) {
          return;
        }
        const group = document.createElement('optgroup');
        group.label = 'Symbols';
        group.dataset.symbols = 'true';
        symbols.forEach((sym) => {
          if (!sym || typeof sym.name !== 'string' || !Number.isFinite(sym.address)) {
            return;
          }
          const option = document.createElement('option');
          option.value = 'symbol:' + sym.name;
          option.textContent = sym.name;
          group.appendChild(option);
        });
        entry.view.appendChild(group);
      });
    }

    function requestSnapshot() {
      if (activeTab !== 'memory') {
        return;
      }
      const rowSize = 16;
      const payloadViews = views.map((entry) => {
        const viewValue = entry.view.value;
        let viewMode = viewValue;
        let addressValue;
        if (viewValue.startsWith('symbol:')) {
          const name = viewValue.slice(7);
          const symAddress = symbolMap.get(name);
          if (symAddress !== undefined) {
            viewMode = 'absolute';
            addressValue = symAddress;
          }
        }
        if (viewMode === 'absolute' && addressValue === undefined) {
          addressValue = parseAddress(entry.address.value);
        }
        return {
          id: entry.id,
          view: viewMode,
          after: parseInt(entry.after.value, 10),
          address: addressValue,
        };
      });
      vscode.postMessage({
        type: 'refresh',
        rowSize,
        views: payloadViews,
      });
      if (statusEl) {
        statusEl.textContent = 'Refreshing…';
      }
    }

    views.forEach((entry) => {
      entry.after.addEventListener('change', requestSnapshot);
      entry.view.addEventListener('change', () => {
        if (entry.view.value.startsWith('symbol:')) {
          const name = entry.view.value.slice(7);
          const address = symbolMap.get(name);
          if (address !== undefined) {
            entry.address.value = formatHex(address, 4);
          }
        }
        requestSnapshot();
      });
      entry.address.addEventListener('change', requestSnapshot);
    });

    window.addEventListener('message', event => {
      if (!event.data) return;
      if (event.data.type === 'selectTab') {
        setTab(event.data.tab, false);
        return;
      }
      if (event.data.type === 'update') {
        if (typeof event.data.uiRevision === 'number') {
          if (event.data.uiRevision < uiRevision) {
            return;
          }
          uiRevision = event.data.uiRevision;
        }
        applyUpdate(event.data);
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
        return;
      }
      if (event.data.type === 'snapshot') {
        updateSymbolOptions(event.data.symbols);
        if (Array.isArray(event.data.views)) {
          event.data.views.forEach((entry) => {
            const target = views.find((view) => view.id === entry.id);
            if (!target) {
              return;
            }
            const labelValue = target.view.value.startsWith('symbol:')
              ? target.view.value.slice(7)
              : target.view.value.toUpperCase();
            target.label.textContent = labelValue;
            target.addr.textContent = formatHex(entry.address ?? 0, 4);
            renderDump(target.dump, entry.start, entry.bytes, entry.focus ?? 0, 16);
            if (entry.symbol) {
              if (entry.symbolOffset) {
                const offset = entry.symbolOffset.toString(16).toUpperCase();
                target.symbol.textContent = entry.symbol + ' + 0x' + offset;
              } else {
                target.symbol.textContent = entry.symbol;
              }
            } else {
              target.symbol.textContent = '';
            }
          });
        }
        if (statusEl) {
          statusEl.textContent = 'Updated';
        }
        return;
      }
      if (event.data.type === 'snapshotError') {
        if (statusEl) {
          statusEl.textContent = event.data.message || 'Snapshot failed';
        }
      }
    });

    applySpeed(speedMode);
    applyMuteState();
    drawLcd();
    buildMatrix();
    drawMatrix();
    setTab(DEFAULT_TAB, false);
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
  </script>`;
}
