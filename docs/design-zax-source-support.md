# Design: First-Class .zax Source Support

**Issue:** #81 — Add first-class .zax source support to debug80  
**Type:** Additive (new language contribution, no changes to existing behaviour)  
**Parallel with:** #78 (assembler abstraction). No dependency between these two.

---

## Motivation

ZAX is a new Z80 assembler with its own source dialect and `.zax` file extension. For debug80
to provide a natural debugging experience with ZAX projects, `.zax` files must be recognized
as debuggable sources — users must be able to open them, set breakpoints in them, and launch
debug sessions from them. This issue addresses the VS Code contribution model only; it does
not add a ZAX assembler backend (that is #79, which depends on #78).

---

## Existing Pattern: How z80-asm Was Added

PR #74 established the ownership pattern that this issue should follow exactly. Debug80
claims a language ID, associates file extensions, registers breakpoints, includes it in
debugger languages, adds a file association default, adds an activation event, and enforces
the language at runtime. The `.zax` contribution follows this template point-for-point.

---

## Integration Points

Every item below must be addressed. They mirror the existing `z80-asm` pattern.

### 1. `package.json` — Language contribution

Add a new entry to `contributes.languages`:

```json
{
  "id": "zax",
  "aliases": ["ZAX"],
  "extensions": [".zax"],
  "configuration": "./out/null-language.json"
}
```

Use `null-language.json` (the existing stub grammar) for now. Syntax highlighting is
explicitly out of scope per the issue — "Syntax highlighting quality can be a follow-up."

### 2. `package.json` — Breakpoints

Add to the `contributes.breakpoints` array:

```json
{ "language": "zax" }
```

This enables breakpoint gutters when a `.zax` file is open.

### 3. `package.json` — Debugger languages

Add `"zax"` to `contributes.debuggers[0].languages`. This tells VS Code that the `z80`
debug adapter handles `zax`-language files.

### 4. `package.json` — Configuration defaults

Add to `contributes.configurationDefaults["files.associations"]`:

```json
"*.zax": "zax"
```

This is the static default that VS Code respects before any extension code runs.

### 5. `package.json` — Activation events

Add to `activationEvents`:

```json
"onLanguage:zax"
```

This ensures debug80 activates when a `.zax` file is opened.

### 6. `src/extension/extension.ts` — Runtime language enforcement

Add a `ZAX_LANGUAGE_ID` constant and an `ensureZaxLanguage()` function that mirrors
the existing `ensureAsmLanguage()` pattern:

```typescript
const ZAX_LANGUAGE_ID = 'zax';

const ensureZaxLanguage = async (doc: vscode.TextDocument): Promise<void> => {
  if (!doc.uri.path.toLowerCase().endsWith('.zax')) {
    return;
  }
  if (doc.languageId === ZAX_LANGUAGE_ID) {
    return;
  }
  const scheme = doc.uri.scheme;
  if (scheme !== 'file' && scheme !== 'untitled') {
    return;
  }
  try {
    await vscode.languages.setTextDocumentLanguage(doc, ZAX_LANGUAGE_ID);
    output.appendLine(
      `Set ${doc.uri.fsPath} language to ${ZAX_LANGUAGE_ID} (was ${doc.languageId})`
    );
  } catch (err) {
    output.appendLine(`Failed to set language for ${doc.uri.fsPath}: ${String(err)}`);
  }
};
```

Wire it into the same `onDidOpenTextDocument` handler and the startup scan by calling
both `ensureAsmLanguage(doc)` and `ensureZaxLanguage(doc)` for each document.

**Alternative (refactored):** If the developer prefers, factor out a generic
`ensureLanguage(doc, extension, languageId)` helper and call it twice — once for
`.asm`/`z80-asm`, once for `.zax`/`zax`. Either approach is acceptable; the key constraint
is that both languages are enforced.

### 7. `src/debug/breakpoint-manager.ts` — Source-path policy

Breakpoint resolution should use direct mapped source paths plus basename matching for path
normalization differences. `.source.*` fallback pairs are deprecated and should not be
reintroduced for either asm80 or ZAX sources.

### 8. `src/debug/path-resolver.ts` — Listing-adjacent source lookup

Listing-adjacent source lookup should only consider direct sibling source files such as
`.asm`, `.zax`, or `.z80`. Deprecated `.source.*` companions are outside the supported
policy.

---

## Test Requirements

### Existing contract tests (`tests/webview/language-contracts.test.ts`)

The existing contract test suite already enforces that:

- Every contributed language has a breakpoint entry.
- Every breakpoint language is in the debugger languages array.

Adding `zax` to `contributes.languages` and `contributes.breakpoints` will automatically
be covered by these existing assertions. **No modification needed** for these tests — they
will enforce the new language by their generic structure.

### New / updated tests

| Test file | What to test |
|-----------|-------------|
| `tests/webview/language-contracts.test.ts` | Add an explicit test: `zax` language has `.zax` extension claim. Add test: `*.zax` has `"zax"` in `configurationDefaults["files.associations"]`. |
| `tests/extension/extension.test.ts` | Add a test that `.zax` documents are forced to `zax` language on open (mirrors the existing `.asm` → `z80-asm` test). |

### Test details for extension.test.ts

The existing test for `.asm` enforcement mocks `vscode.workspace.textDocuments` with
a doc whose `uri.path` ends in `.asm` and `languageId` is `'plaintext'`. The test verifies
`setTextDocumentLanguage` is called with `(doc, 'z80-asm')`.

Add a parallel test:
- Mock a doc with `uri.path: '/tmp/test.zax'` and `languageId: 'plaintext'`.
- Verify `setTextDocumentLanguage` is called with `(doc, 'zax')`.

---

## File Plan

| Action | File | Notes |
|--------|------|-------|
| **Edit** | `package.json` | Add `zax` language, breakpoint, debugger language, config default, activation event |
| **Edit** | `src/extension/extension.ts` | Add `ZAX_LANGUAGE_ID`, `ensureZaxLanguage()`, wire into startup + onDidOpenTextDocument |
| **Edit** | `tests/extension/extension.test.ts` | Add `.zax` → `zax` enforcement test |
| **Edit** | `tests/webview/language-contracts.test.ts` | Add explicit `zax` extension and file association assertions |
| **Edit** | `docs/technical.md` | Document that `.zax` files are recognized debug sources |

---

## Acceptance Criteria (from issue #81)

- [ ] `.zax` files are recognized by debug80 as valid debug sources.
- [ ] Users can set breakpoints in `.zax` files.
- [ ] Launch/config documentation explains how to debug a ZAX project.
- [ ] Tests cover the configuration contract where practical.

---

## What This Does NOT Do

- Does not add a ZAX assembler backend (that is #78 + #79).
- Does not add syntax highlighting for `.zax` (follow-up work).
- Does not modify breakpoint-manager's alternate source path logic.
- Does not add a TextMate grammar (uses null-language.json stub).
- Does not change any existing `.asm` behaviour.
