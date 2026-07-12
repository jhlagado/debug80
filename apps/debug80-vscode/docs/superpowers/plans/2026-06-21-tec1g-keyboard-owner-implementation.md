# TEC-1G Keyboard Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TEC-1G physical keyboard routing explicit so Keypad, Matrix Keyboard, and Joystick can coexist without hidden precedence conflicts.

**Architecture:** Add a small `keyboard-owner` helper that owns routing state and fallback rules. Keep device-specific key translation in the existing keypad, matrix, and joystick controllers. Wire the TEC-1G entrypoint so accordion events and pointer intent set the owner before global key routing runs.

**Tech Stack:** TypeScript, webview DOM APIs, Vitest with `happy-dom`.

---

### Task 1: Keyboard Owner Helper

**Files:**
- Create: `webview/tec1g/keyboard-owner.ts`
- Test: `tests/webview/tec1g-keyboard-owner.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for default owner selection, user-selected matrix/joystick ownership while both panels are open, fallback when the current owner closes, and native editable bypass.

- [ ] **Step 2: Verify red**

Run: `npx vitest --config vitest.webview.config.ts tests/webview/tec1g-keyboard-owner.test.ts --run`

Expected: fails because `webview/tec1g/keyboard-owner.ts` does not exist.

- [ ] **Step 3: Implement helper**

Export `KeyboardOwner`, `KeyboardOwnerVisibility`, `createKeyboardOwnerController`, and `isNativeKeyboardTarget`.

- [ ] **Step 4: Verify green**

Run the same focused test command and confirm it passes.

### Task 2: Joystick Mapping and Labels

**Files:**
- Modify: `webview/tec1g/joystick-ui.ts`
- Modify: `webview/tec1g/index.html`
- Modify: `webview/tec1g/styles.css`
- Test: `tests/webview/tec1g-joystick-ui.test.ts`
- Test: `tests/webview/tec1g-visibility.test.ts`

- [ ] **Step 1: Write failing tests**

Test that `I/J/K/M/Space` map to Fire 2, Fire 1, Fire 3, Aux, and Fire 1 alias. Test that the visible joystick HTML uses `Aux` instead of `Comm2`.

- [ ] **Step 2: Verify red**

Run: `npx vitest --config vitest.webview.config.ts tests/webview/tec1g-joystick-ui.test.ts tests/webview/tec1g-visibility.test.ts --run`

Expected: fails because `M` is unmapped and the HTML still contains `Comm2`.

- [ ] **Step 3: Implement mapping and label update**

Change `KeyI` to Fire 2, `KeyM` to Aux, remove `KeyU`, keep `Space` as Fire 1, and update the action cluster to a diamond with `Aux / Pin 9`.

- [ ] **Step 4: Verify green**

Run the same focused test command and confirm it passes.

### Task 3: TEC-1G Routing Integration

**Files:**
- Modify: `webview/tec1g/index.ts`
- Modify: `webview/tec1g/matrix-routing-cue.ts` if a cue text adjustment is needed.
- Test: add integration-focused assertions to `tests/webview/tec1g-keyboard-owner.test.ts` or a focused entrypoint-adjacent test if practical.

- [ ] **Step 1: Write failing routing tests**

Cover owner fallback and native-target bypass in the helper. If entrypoint tests are practical, cover pointer selection for joystick while matrix is open.

- [ ] **Step 2: Verify red**

Run the focused owner test and confirm the new assertion fails.

- [ ] **Step 3: Wire owner into entrypoint**

Replace matrix-open precedence with explicit owner checks. Accordion open events set default owner. Pointerdown in Machine, Matrix Keyboard, and Joystick panels selects owner. Global keydown/keyup routes to the current owner only.

- [ ] **Step 4: Verify green**

Run the focused owner, joystick, and visibility tests.

### Task 4: Final Verification and Review

**Files:**
- All files touched above.

- [ ] **Step 1: Run targeted webview tests**

Run: `npx vitest --config vitest.webview.config.ts tests/webview/tec1g-keyboard-owner.test.ts tests/webview/tec1g-joystick-ui.test.ts tests/webview/tec1g-visibility.test.ts tests/webview/tec1g-matrix-ui.test.ts --run`

- [ ] **Step 2: Run broader affected tests**

Run: `npx vitest --config vitest.webview.config.ts tests/webview/common/keypad-focus-routing.test.ts tests/webview/tec1g-matrix-routing-cue.test.ts tests/webview/tec1g-platform-update.test.ts --run`

- [ ] **Step 3: Request high-effort review**

Dispatch a reviewer with the design spec, plan, and current diff. Address Critical and Important findings before final response.

