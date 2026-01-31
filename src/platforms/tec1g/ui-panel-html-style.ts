/**
 * @file Tec1g panel HTML styles.
 */

/**
 * Returns the TEC-1G panel style block.
 */
export function getTec1gStyle(): string {
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
      grid-template-columns: auto 300px;
      gap: 16px;
      align-items: start;
      justify-items: start;
      justify-content: start;
      width: fit-content;
      max-width: 100%;
    }
    .left-col,
    .right-col {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .right-col {
      align-items: stretch;
      --keypad-width: 282px;
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
      grid-template-columns: repeat(6, 42px);
      grid-template-rows: repeat(4, 42px);
      gap: 2px;
      align-items: center;
      width: var(--keypad-width);
      background: #1c1c1c;
      padding: 10px;
      border-radius: 6px;
    }
    .keycap {
      width: 42px;
      height: 42px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      cursor: pointer;
      user-select: none;
      box-shadow:
        0 4px 0 #0a0a0a,
        0 4px 2px rgba(0, 0, 0, 0.6);
    }
    .keycap::before {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 10px;
      background: linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.5) 0%,
        rgba(255, 255, 255, 0.1) 50%,
        rgba(0, 0, 0, 0.1) 100%
      );
      box-shadow:
        inset 0 2px 4px rgba(255, 255, 255, 0.5),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
    }
    .keycap:active {
      transform: translateY(2px);
      box-shadow:
        0 2px 0 #0a0a0a,
        0 2px 1px rgba(0, 0, 0, 0.6);
    }
    .keycap .label {
      position: relative;
      font-family: system-ui, sans-serif;
      font-weight: 700;
      color: #444;
      user-select: none;
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
    }
    .keycap .label.short {
      font-size: 20px;
    }
    .keycap .label.long {
      font-size: 11px;
      letter-spacing: 0.06em;
    }
    .keycap-light {
      background: linear-gradient(to bottom, #d8dce0 0%, #b8bcc0 100%);
    }
    .keycap-cream {
      background: linear-gradient(to bottom, #efe4d0 0%, #d4c9b5 100%);
    }
    .keycap.spacer {
      background: transparent;
      box-shadow: none;
      cursor: default;
    }
    .keycap.spacer::before {
      display: none;
    }
    .sysctrl {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      padding: 6px;
      background: #232323;
      border-radius: 6px;
      box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.08);
    }
    .sysctrl-seg {
      width: 100%;
      height: 12px;
      border-radius: 2px;
      background: #454545;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
    }
    .sysctrl-seg.on {
      background: linear-gradient(to bottom, #ffd84d 0%, #e08a2a 100%);
      box-shadow: 0 0 6px rgba(255, 196, 70, 0.6);
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
    .glcd {
      margin-top: 0;
      background: #2f6b4a;
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #243528;
      width: var(--keypad-width);
    }
    .glcd-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #7fb88a;
      margin-bottom: 6px;
    }
    .glcd-canvas {
      display: block;
      border: 1px solid #274334;
      border-radius: 6px;
      background: #9eb663;
      image-rendering: pixelated;
      width: 100%;
      height: auto;
      box-shadow: inset 0 0 10px rgba(10, 20, 10, 0.5);
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
    .ui-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      margin-bottom: 14px;
      padding: 8px 10px;
      background: #121212;
      border: 1px solid #2c2c2c;
      border-radius: 10px;
      font-size: 12px;
      color: #d6d6d6;
    }
    .ui-controls label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
    }
    .ui-controls input {
      accent-color: #9acbff;
    }
    .ui-hidden {
      display: none !important;
    }
    #memoryPanel {
      margin-top: 4px;
    }
    #memoryPanel .shell {
      border: 1px solid #2c2c2c;
      border-radius: 10px;
      padding: 12px;
      background: #121212;
    }
    #memoryPanel h1 {
      font-size: 16px;
      margin: 0 0 8px 0;
    }
    #memoryPanel .section {
      margin-top: 12px;
    }
    #memoryPanel .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    #memoryPanel .section h2 {
      font-size: 13px;
      margin: 0 0 6px 0;
      color: #d8d8d8;
    }
    #memoryPanel .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
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
      padding: 5px 8px;
      font-size: 12px;
    }
    #memoryPanel .controls input {
      width: 100px;
    }
    #memoryPanel .addr {
      color: #7cc1ff;
      margin-left: 6px;
    }
    #memoryPanel .symbol {
      color: #9aa0a6;
      margin-left: 8px;
      font-size: 11px;
    }
    #memoryPanel .dump {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
      font-size: 11px;
      background: #0b0b0b;
      border: 1px solid #2c2c2c;
      border-radius: 8px;
      padding: 8px;
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
