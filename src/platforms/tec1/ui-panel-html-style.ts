/**
 * @file Tec1 panel HTML styles.
 */

/**
 * Returns the TEC-1 panel style block.
 */
export function getTec1Style(): string {
  return `<style>
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
    .serial-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .serial-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #c0c0c0;
    }
    .serial-buttons {
      display: flex;
      gap: 6px;
    }
    .key-small {
      font-size: 9px;
      padding: 4px 8px;
      min-width: auto;
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
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .tab {
      background: #1f1f1f;
      border: 1px solid #333;
      color: #d0d0d0;
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 11px;
      letter-spacing: 0.12em;
      cursor: pointer;
    }
    .tab.active {
      background: #3a3a3a;
      color: #fff;
      border-color: #5a5a5a;
    }
    .panel {
      display: none;
    }
    .panel.active {
      display: block;
    }
    #memoryPanel {
      margin-top: 4px;
    }
    #memoryPanel .shell {
      border: none;
      border-radius: 10px;
      padding: 12px;
      background: #121212;
    }
    #memoryPanel h1 {
      font-size: 14px;
      margin: 0 0 6px 0;
    }
    #memoryPanel .register-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
      font-size: 11px;
      color: #d8d8d8;
      margin-bottom: 12px;
    }
    #memoryPanel .register-item {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 2px 6px;
      border-radius: 6px;
      background: #141414;
      border: 1px solid #2a2a2a;
      min-width: 92px;
      justify-content: space-between;
    }
    #memoryPanel .register-label {
      color: #9aa0a6;
      font-size: 10px;
      min-width: 3ch;
      text-align: left;
    }
    #memoryPanel .register-value {
      color: #cde6ff;
      font-weight: 600;
    }
    #memoryPanel .register-flags {
      color: #f5d08b;
      font-weight: 600;
    }
    #memoryPanel .section {
      margin-top: 8px;
    }
    #memoryPanel .section-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      flex-wrap: nowrap;
    }
    #memoryPanel .section h2 {
      font-size: 12px;
      margin: 0 0 4px 0;
      color: #d8d8d8;
    }
    #memoryPanel .controls {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      align-items: center;
      gap: 6px 10px;
      width: 100%;
    }
    #memoryPanel .controls label {
      font-size: 11px;
      color: #9aa0a6;
    }
    #memoryPanel .controls select,
    #memoryPanel .controls input {
      background: #1f1f1f;
      color: #f0f0f0;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 11px;
    }
    #memoryPanel .controls input {
      width: 86px;
    }
    #memoryPanel .controls .absolute-input {
      justify-self: end;
      max-width: 120px;
    }
    #memoryPanel .addr {
      color: #7cc1ff;
      margin-left: 6px;
    }
    #memoryPanel .symbol {
      color: #9aa0a6;
      margin-left: 8px;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
      min-width: 0;
    }
    #memoryPanel .dump {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
      font-size: 11px;
      background: #0b0b0b;
      border: 1px solid #2c2c2c;
      border-radius: 8px;
      padding: 6px;
      overflow-x: auto;
      white-space: pre;
    }
    #memoryPanel .row {
      display: flex;
      gap: 10px;
      line-height: 1.6;
    }
    #memoryPanel .row .row-addr {
      width: 72px;
      color: #6aa6d6;
    }
    #memoryPanel .byte {
      display: inline-block;
      width: 22px;
      text-align: center;
    }
    #memoryPanel .byte.focus {
      color: #111;
      background: #ffd05c;
      border-radius: 4px;
    }
    #memoryPanel .ascii {
      margin-left: 12px;
      color: #cfcfcf;
      letter-spacing: 1px;
    }
  </style>`;
}
