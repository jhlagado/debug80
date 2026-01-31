/**
 * @file Tec1 panel HTML markup.
 */

/**
 * Returns the TEC-1 panel markup body.
 */
export function getTec1Markup(): string {
  return `
  <div id="app" tabindex="0">
    <div class="tabs">
      <button class="tab" data-tab="ui">UI</button>
      <button class="tab" data-tab="memory">MEMORY</button>
    </div>
    <div class="panel panel-ui" id="panel-ui">
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
    <div class="panel panel-memory" id="panel-memory">
      <div class="memory-panel" id="memoryPanel">
        <div class="shell">
          <h1>CPU Pointer View</h1>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-a">PC</span> <span class="addr" id="addr-a">0x0000</span><span class="symbol" id="sym-a"></span></h2>
              <div class="controls">
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
                <input id="address-a" type="text" placeholder="0x0000" />
                <select id="after-a">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-a"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-b">SP</span> <span class="addr" id="addr-b">0x0000</span><span class="symbol" id="sym-b"></span></h2>
              <div class="controls">
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
                <input id="address-b" type="text" placeholder="0x0000" />
                <select id="after-b">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-b"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-c">HL</span> <span class="addr" id="addr-c">0x0000</span><span class="symbol" id="sym-c"></span></h2>
              <div class="controls">
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
                <input id="address-c" type="text" placeholder="0x0000" />
                <select id="after-c">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-c"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-d">DE</span> <span class="addr" id="addr-d">0x0000</span><span class="symbol" id="sym-d"></span></h2>
              <div class="controls">
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
                <input id="address-d" type="text" placeholder="0x0000" />
                <select id="after-d">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-d"></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
