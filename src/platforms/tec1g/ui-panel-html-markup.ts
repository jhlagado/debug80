/**
 * @file Tec1g panel HTML markup.
 */

/**
 * Returns the TEC-1G panel markup body.
 */
export function getTec1gMarkup(): string {
  return `
  <div id="app" tabindex="0">
    <div class="tabs">
      <button class="tab" data-tab="ui">UI</button>
      <button class="tab" data-tab="memory">CPU</button>
    </div>
    <div class="panel panel-ui" id="panel-ui">
      <div class="ui-controls" id="uiControls">
        <label><input type="checkbox" data-section="lcd" checked /> LCD</label>
        <label><input type="checkbox" data-section="display" checked /> 7-SEG</label>
        <label><input type="checkbox" data-section="keypad" checked /> KEYPAD</label>
        <label><input type="checkbox" data-section="matrixKeyboard" checked /> MATRIX KBD</label>
        <label><input type="checkbox" data-section="matrix" /> 8x8 MATRIX</label>
        <label><input type="checkbox" data-section="glcd" /> GLCD</label>
        <label><input type="checkbox" data-section="serial" checked /> SERIAL</label>
      </div>
      <div class="layout">
        <div class="left-col">
          <div class="lcd ui-section" data-section="lcd">
            <div class="lcd-title">LCD (HD44780 A00)</div>
            <canvas class="lcd-canvas" id="lcdCanvas" width="224" height="40"></canvas>
          </div>
          <div class="display-block ui-section" data-section="display">
            <div class="display" id="display"></div>
            <div class="status">
              <div class="key speed" id="speed">SLOW</div>
              <div class="key mute" id="mute">MUTED</div>
              <div class="speaker" id="speaker">
                <span id="speakerLabel">SPEAKER</span>
              </div>
            </div>
          </div>
        </div>
        <div class="right-col">
          <div class="glcd ui-section" data-section="glcd">
            <div class="glcd-title">GLCD (128x64)</div>
            <canvas class="glcd-canvas" id="glcdCanvas" width="320" height="160"></canvas>
          </div>
          <div class="keypad ui-section" id="keypad" data-section="keypad"></div>
          <div class="matrix-keyboard ui-section" data-section="matrixKeyboard">
            <div class="matrix-keyboard-title">MATRIX KEYBOARD</div>
            <div class="matrix-keyboard-controls">
              <div class="key" id="matrixModeToggle">MATRIX MODE</div>
              <div class="matrix-keyboard-indicator" id="matrixModeStatus">OFF</div>
              <div class="matrix-keyboard-indicator" id="matrixCapsStatus">CAPS</div>
            </div>
            <div class="matrix-keyboard-hint">Type to send keys (Enter/Esc supported).</div>
          </div>
          <div class="matrix ui-section" data-section="matrix">
            <div class="matrix-title">8x8 LED MATRIX</div>
            <div class="matrix-grid" id="matrixGrid"></div>
          </div>
        </div>
      </div>
      <div class="serial ui-section" data-section="serial">
        <div class="serial-title">SERIAL (BIT 6)</div>
        <pre class="serial-body" id="serialOut"></pre>
        <div class="serial-input">
          <input id="serialInput" type="text" placeholder="Type and press Enter (CR)..." />
          <div class="key" id="serialSend">SEND</div>
        </div>
      </div>
    </div>
    <div class="panel panel-memory" id="panel-memory">
      <div class="memory-panel" id="memoryPanel">
        <div class="shell">
          <div class="register-strip" id="registerStrip"></div>
          <div class="section">
            <div class="section-header">
              <div class="controls">
                <div class="controls-left">
                  <select id="view-a">
                    <option value="pc" selected>PC</option>
                    <option value="sp">SP</option>
                    <option value="bc">BC</option>
                    <option value="de">DE</option>
                    <option value="hl">HL</option>
                    <option value="ix">IX</option>
                    <option value="iy">IY</option>
                    <option value="absolute">Absolute</option>
                  </select>
                  <span class="addr" id="addr-a">0x0000</span>
                  <span class="symbol" id="sym-a"></span>
                </div>
                <input class="absolute-input" id="address-a" type="text" placeholder="0x0000" />
              </div>
            </div>
            <div class="dump" id="dump-a"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <div class="controls">
                <div class="controls-left">
                  <select id="view-b">
                    <option value="pc">PC</option>
                    <option value="sp" selected>SP</option>
                    <option value="bc">BC</option>
                    <option value="de">DE</option>
                    <option value="hl">HL</option>
                    <option value="ix">IX</option>
                    <option value="iy">IY</option>
                    <option value="absolute">Absolute</option>
                  </select>
                  <span class="addr" id="addr-b">0x0000</span>
                  <span class="symbol" id="sym-b"></span>
                </div>
                <input class="absolute-input" id="address-b" type="text" placeholder="0x0000" />
              </div>
            </div>
            <div class="dump" id="dump-b"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <div class="controls">
                <div class="controls-left">
                  <select id="view-c">
                    <option value="pc">PC</option>
                    <option value="sp">SP</option>
                    <option value="bc">BC</option>
                    <option value="de">DE</option>
                    <option value="hl" selected>HL</option>
                    <option value="ix">IX</option>
                    <option value="iy">IY</option>
                    <option value="absolute">Absolute</option>
                  </select>
                  <span class="addr" id="addr-c">0x0000</span>
                  <span class="symbol" id="sym-c"></span>
                </div>
                <input class="absolute-input" id="address-c" type="text" placeholder="0x0000" />
              </div>
            </div>
            <div class="dump" id="dump-c"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <div class="controls">
                <div class="controls-left">
                  <select id="view-d">
                    <option value="pc">PC</option>
                    <option value="sp">SP</option>
                    <option value="bc">BC</option>
                    <option value="de" selected>DE</option>
                    <option value="hl">HL</option>
                    <option value="ix">IX</option>
                    <option value="iy">IY</option>
                    <option value="absolute">Absolute</option>
                  </select>
                  <span class="addr" id="addr-d">0x0000</span>
                  <span class="symbol" id="sym-d"></span>
                </div>
                <input class="absolute-input" id="address-d" type="text" placeholder="0x0000" />
              </div>
            </div>
            <div class="dump" id="dump-d"></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
