# Debug80 Code Quality Analysis & Improvement Roadmap

**Analysis Date:** February 2026
**Scope:** 82 TypeScript source files, 47 test files, ~24,000 lines of code
**Current Status:** 374 passing tests, 64% coverage, all lint/build gates passing

---

## Executive Summary

The debug80 codebase has undergone significant refactoring since the last analysis. Key improvements include:

1. **UI Panel Modularization**: TEC-1G panel reduced from 2,081 → 311 lines, TEC-1 panel from 1,499 → 274 lines
2. **Global State Encapsulation**: `SessionStateManager` class created (extension.ts globals reduced)
3. **Service Extraction**: `VariableService`, `SourceStateManager`, `RuntimeController` extracted
4. **File Size Reduction**: adapter.ts reduced from 1,248 → 1,130 lines

**Remaining Opportunities:**
1. **Test Coverage**: Dropped from 94% to 64% (needs attention)
2. **Windows Compatibility**: Good foundation with `path-utils.ts`, but some edge cases remain
3. **Documentation**: Many files now have JSDoc, but coverage is uneven
4. **Large Files**: decode.ts (1,616), ui-panel-html files (1,647 + 1,160), runtime.ts (996)

---

## Part 1: Structural Analysis (Updated February 2026)

### 1.1 File Size Distribution

**Files >1,000 lines (requires attention):**

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `src/platforms/tec1g/st7920-font.ts` | 2,318 | ✅ Acceptable | Pure data file, no logic |
| `src/platforms/tec1g/ui-panel-html.ts` | 1,647 | ⚠️ Medium | HTML template, could split |
| `src/z80/decode.ts` | 1,616 | ✅ Acceptable | Intentional closure pattern |
| `src/platforms/tec1/ui-panel-html.ts` | 1,160 | ⚠️ Medium | HTML template |
| `src/debug/adapter.ts` | 1,130 | ⚠️ Improved | Down from 1,248, still large |
| `src/extension/extension.ts` | 1,001 | ⚠️ Medium | Global state improved |
| `src/platforms/tec1g/runtime.ts` | 996 | ⚠️ Medium | Platform runtime |
| `src/z80/decode-tables.ts` | 951 | ✅ Acceptable | Data tables |

**Successfully Refactored (improvements from previous analysis):**

| File | Previous | Current | Reduction |
|------|----------|---------|-----------|
| `src/platforms/tec1g/ui-panel.ts` | 2,081 | 311 | **85%** |
| `src/platforms/tec1/ui-panel.ts` | 1,499 | 274 | **82%** |
| `src/debug/adapter.ts` | 1,248 | 1,130 | **9%** |

### 1.2 Module Organization Quality

**✅ Well-organized modules:**
- `src/debug/` - 33 focused files, clear separation of concerns
- `src/platforms/tec1/` - 11 files, UI properly split into state/html/messages/refresh
- `src/platforms/tec1g/` - 14 files, same modular pattern
- `src/mapping/` - Clear layer separation (parser, layer2, d8-map, source-map)
- `src/extension/` - SessionStateManager extracted

**Extracted Services (since last analysis):**
- `VariableService` - Register/scope handling
- `SourceStateManager` - Source file state management
- `RuntimeControlContext` - Execution control context
- `BreakpointManager` - Breakpoint lifecycle
- `StackService` - Stack frame building
- `SymbolService` - Symbol index building

---

## Part 2: Windows Compatibility Analysis (CRITICAL)

### 2.1 Cross-Platform Path Handling

**✅ EXCELLENT: Dedicated path utilities in `src/debug/path-utils.ts`:**

```typescript
export const IS_WINDOWS = process.platform === 'win32';

export function normalizePathForKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return IS_WINDOWS ? resolved.toLowerCase() : resolved;
}

export function pathsEqual(path1: string, path2: string): boolean {
  // Case-insensitive on Windows
}

export function isPathWithin(filePath: string, baseDir: string): boolean {
  // Handles path separators correctly
}

export function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export function fromPortablePath(portablePath: string): string {
  return portablePath.split('/').join(path.sep);
}
```

**✅ Assembler has Windows support in `src/debug/assembler.ts`:**

```typescript
const candidates =
  process.platform === 'win32' 
    ? ['asm80.cmd', 'asm80.exe', 'asm80.ps1', 'asm80'] 
    : ['asm80'];

// Windows executables run directly
if (
  process.platform === 'win32' &&
  (lower.endsWith('.cmd') || lower.endsWith('.exe') || lower.endsWith('.ps1'))
) {
  return false;
}
```

### 2.2 Potential Windows Issues

**⚠️ ISSUE 1: Mixed path separator handling in layer2.ts**
```typescript
// Line 214 - Explicit backslash check (good for escape chars)
if (ch === '\\') {
  i += 1;
  continue;
}
```

**⚠️ ISSUE 2: Hardcoded forward slashes in memory-utils.ts**
```typescript
// Line 196 - Good: handles both separators
const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
```

**⚠️ ISSUE 3: Tests use Unix-style paths**
Many tests use paths like `/home/user/project` or `/tmp/` which won't run correctly on Windows:
```typescript
// tests/debug/launch-args.test.ts
const baseDir = '/tmp';  // Won't exist on Windows
```

**Recommendation:** Use `os.tmpdir()` and cross-platform path construction in tests.

### 2.3 Windows-Critical Areas

| Area | Status | Notes |
|------|--------|-------|
| Path comparison | ✅ Good | `pathsEqual()` is case-insensitive on Windows |
| Path normalization | ✅ Good | `normalizePathForKey()` lowercases on Windows |
| Path containment | ✅ Good | `isPathWithin()` handles separators |
| Portable paths | ✅ Good | `toPortablePath/fromPortablePath` for JSON storage |
| Assembler invocation | ✅ Good | Handles .cmd, .exe, .ps1 extensions |
| Test fixtures | ⚠️ Issue | Unix paths in test files |
| Line endings | ⚠️ Unknown | No explicit CRLF handling observed |

### 2.4 Windows Compatibility Recommendations

1. **Update test fixtures** to use `path.join()` and `os.tmpdir()` consistently
2. **Add Windows CI** to GitHub Actions to catch platform-specific issues
3. **Consider line ending normalization** when reading source files
4. **Add Windows-specific test cases** for path utilities

---

## Part 3: Test Coverage Analysis

### 3.1 Current Coverage Status

```
Coverage Summary (February 2026):
  Lines:      64.01% (DOWN from 94.35%)
  Statements: 64.01%
  Branches:   73.52%
  
  Test Files: 40 passed (374 tests)
```

**⚠️ CRITICAL: Coverage has dropped significantly.**

The coverage reduction is likely due to:
1. New code added without corresponding tests
2. UI panel HTML files are large and untested
3. Platform runtime files have low coverage

### 3.2 Coverage by Module

| Module | Estimated Coverage | Priority |
|--------|-------------------|----------|
| `src/z80/` | ~96% | ✅ Excellent |
| `src/mapping/` | ~85% | ✅ Good |
| `src/debug/` | ~70% | ⚠️ Medium |
| `src/platforms/tec1/` | ~40% | 🔴 Low |
| `src/platforms/tec1g/` | ~40% | 🔴 Low |
| `src/extension/` | ~20% | 🔴 Low |

### 3.3 Test Organization Quality

**✅ Good:**
- Tests mirror source structure (`tests/debug/`, `tests/mapping/`, `tests/z80/`)
- Fixtures directory exists
- Test file naming convention followed (`.test.ts`)

**⚠️ Issues:**
- Compiled test files in source tree (`.d.ts`, `.js`, `.js.map` files in tests/debug/)
- No integration tests for VS Code extension
- Platform tests are minimal

---

## Part 4: Code Quality Metrics

### 4.1 TypeScript Configuration

**✅ EXCELLENT: Strict TypeScript settings in tsconfig.json:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

These are best-in-class TypeScript settings.

### 4.2 ESLint Configuration

**✅ GOOD: Strong ESLint rules in .eslintrc.cjs:**

```javascript
rules: {
  '@typescript-eslint/explicit-function-return-type': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/strict-boolean-expressions': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
}
```

### 4.3 Code Smells

**ESLint Overrides (5 total):**
```
src/debug/runtime-control.ts:71  - no-constant-condition (while(true) loop)
src/debug/runtime-control.ts:195 - no-constant-condition (while(true) loop)
src/z80/constants.ts:12          - max-lines (data file)
src/z80/constants.ts:13          - camelcase (legacy Z80 naming)
src/z80/decode.ts:1550           - no-shadow (intentional)
```

All overrides are justified and documented.

### 4.4 Error Handling Quality

**✅ EXCELLENT: Comprehensive error hierarchy in `src/debug/errors.ts`:**

- `Debug80Error` - Base class with code and context
- `ConfigurationError` - Config issues
- `UnsupportedPlatformError` - Platform validation
- `MissingConfigError` - Missing config keys
- `AssemblyError` - asm80 failures
- `FileResolutionError` - File not found
- `RuntimeError` - Execution errors

---

## Part 5: Documentation Analysis

### 5.1 JSDoc Coverage

**Files with good documentation:**
- `src/debug/config-validation.ts` - 9 JSDoc blocks
- `src/debug/errors.ts` - Comprehensive error docs
- `src/debug/path-utils.ts` - All functions documented
- `src/debug/path-resolver.ts` - All functions documented
- `src/debug/assembler.ts` - All functions documented
- `src/mapping/d8-map.ts` - 61 JSDoc blocks
- `src/platforms/tec-common/index.ts` - 82 JSDoc blocks

**Files needing documentation:**
- `src/extension/extension.ts` - File-level doc only
- `src/platforms/tec1g/runtime.ts` - Minimal docs
- `src/platforms/tec1/runtime.ts` - Minimal docs

### 5.2 File-Level Documentation

Most files now have `@file` or `@fileoverview` JSDoc comments.

---

## Part 6: Architecture Quality

### 6.1 Separation of Concerns

**✅ Good Patterns Observed:**

1. **Debug Adapter** - DAP protocol handling separated from execution
2. **Platform Abstraction** - Clean platform interface in `src/platforms/types.ts`
3. **Service Extraction** - VariableService, StackService, SymbolService
4. **State Management** - SessionStateManager, SourceStateManager
5. **UI Components** - State/HTML/Messages/Refresh separation in panels

### 6.2 Dependency Flow

```
extension.ts
    └── adapter.ts (Z80DebugSession)
            ├── runtime-control.ts
            ├── breakpoint-manager.ts
            ├── source-state-manager.ts
            ├── variable-service.ts
            ├── stack-service.ts
            └── platform-host.ts
                    ├── tec1/runtime.ts
                    └── tec1g/runtime.ts
```

Clean unidirectional flow with no circular dependencies observed.

---

## Part 7: Prioritized Recommendations

### Tier 1: Critical (Do Immediately)

| Issue | Impact | Effort | Risk |
|-------|--------|--------|------|
| Add Windows CI | High | 2 hours | Low |
| Fix test coverage | High | 8 hours | Low |
| Clean compiled files from tests/ | Medium | 30 min | Low |

### Tier 2: High Priority

| Issue | Impact | Effort | Risk |
|-------|--------|--------|------|
| Add Windows path tests | High | 4 hours | Low |
| Document runtime.ts files | Medium | 4 hours | Low |
| Split ui-panel-html.ts files | Medium | 8 hours | Medium |

### Tier 3: Medium Priority

| Issue | Impact | Effort | Risk |
|-------|--------|--------|------|
| Reduce adapter.ts further | Medium | 8 hours | Medium |
| Add platform integration tests | Medium | 8 hours | Low |
| Improve decode.ts navigation | Low | 4 hours | Low |

### Tier 4: Nice to Have

| Issue | Impact | Effort | Risk |
|-------|--------|--------|------|
| Add VS Code extension tests | Medium | 16 hours | Medium |
| Extract more adapter services | Low | 8 hours | Medium |

---

## Part 8: Windows Compatibility Checklist

Before releasing on Windows:

- [ ] Add Windows to CI matrix
- [ ] Run full test suite on Windows
- [ ] Test with Windows-style paths (C:\Users\...)
- [ ] Test assembler invocation (.cmd, .exe)
- [ ] Test file watching with CRLF line endings
- [ ] Test breakpoint setting with Windows paths
- [ ] Test debug map generation/loading
- [ ] Test ROM file loading

---

## Part 9: Quality Gates

### Current Status

```
yarn lint     ✅ PASS (0 errors, 0 warnings)
yarn build    ✅ PASS (0 errors)
yarn test     ✅ PASS (374 tests)
coverage      ❌ FAIL (64% < 80% threshold)
```

### Recommended Thresholds

```json
{
  "lines": 75,
  "statements": 75,
  "branches": 70,
  "functions": 75
}
```

Current 80% threshold may be too aggressive for UI-heavy code.

---

## Part 10: Summary of Improvements Since Last Analysis

### Completed Refactorings

1. ✅ UI Panel Modularization (85% reduction)
2. ✅ SessionStateManager extraction
3. ✅ Service extraction (Variable, Stack, Symbol, Source)
4. ✅ Path utilities for Windows
5. ✅ Error hierarchy
6. ✅ JSDoc coverage improvement

### Remaining Work

1. ⚠️ Test coverage restoration
2. ⚠️ Windows CI setup
3. ⚠️ ui-panel-html.ts splitting
4. ⚠️ Platform runtime documentation
5. ⚠️ Integration tests

---

## Appendix A: File Statistics

```
Total source files:  82
Total test files:    47
Total lines (src):   ~24,000
Total lines (tests): ~8,000

Largest files:
  1. st7920-font.ts        2,318 (data)
  2. ui-panel-html.ts (1g) 1,647 (template)
  3. decode.ts             1,616 (emulator core)
  4. ui-panel-html.ts (1)  1,160 (template)
  5. adapter.ts            1,130 (debug adapter)
```

---

## Appendix B: Action Items Summary

### Immediate (This Sprint)
1. Add GitHub Actions workflow for Windows
2. Fix or update coverage thresholds
3. Remove compiled files from tests/debug/

### Next Sprint
1. Add Windows-specific test cases
2. Document platform runtime files
3. Consider splitting ui-panel-html files

### Backlog
1. VS Code extension integration tests
2. Further adapter.ts service extraction
3. decode.ts section navigation improvements
