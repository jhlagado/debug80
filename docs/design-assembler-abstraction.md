# Design: Assembler Backend Abstraction

**Issue:** #78 — Refactor assembler integration to support multiple backends  
**Type:** Additive refactor (no breaking changes to current behaviour)  
**Invariant stress:** None — asm80 remains default; abstraction adds a seam  

---

## Motivation

Debug80's assembler integration is currently hardcoded to asm80 in three modules and the
launch config schema. Every reference — binary resolution, subprocess invocation, in-process
compilation for extra listings, and user-facing description strings — names asm80 directly.
This makes it impossible to add a second assembler backend (such as ZAX) without forking
those paths with ad-hoc conditionals.

The goal is to introduce a small, explicit assembler backend interface that captures the
contract debug80 actually needs from an assembler, move the existing asm80 code behind that
interface, and wire backend selection so it can be driven by configuration or source extension.

---

## Current Integration Points

The following table summarises every place asm80 is coupled into the codebase. Each row
must be addressed by this refactor.

| Module | Mechanism | What it does |
|--------|-----------|--------------|
| `src/debug/assembler.ts` | `findAsm80Binary()`, `resolveBundledAsm80()`, `resolveAsm80Command()` | Locates the asm80 CLI binary |
| `src/debug/assembler.ts` | `runAssembler()` | Spawns `asm80 -m Z80 -t hex -o …` via `spawnSync` |
| `src/debug/assembler.ts` | `runAssemblerBin()` | Spawns asm80 with `.BINFROM`/`.BINTO` wrapper for binary output |
| `src/debug/launch-pipeline.ts` | `assembleIfRequested()` | Calls `runAssembler` / `runAssemblerBin`; error message says "asm80 failed" |
| `src/debug/mapping-service.ts` | `import * as asm80Module` / `import * as asm80Monolith` | In-process `asm80Module.compile()` for extra listing fallback |
| `src/debug/mapping-service.ts` | `buildAsm80Mapping()` | Compiles source in-process and extracts segments/anchors |
| `package.json` | `contributes.debuggers[0].configurationAttributes` | Description strings reference "asm80" |
| `package.json` | `contributes.debuggers[0].configurationSnippets` | Snippet description says "asm80-generated" |
| `docs/technical.md` | Section 7 | Documents asm80 integration |

---

## Assembler Backend Interface

The backend interface must capture the two distinct capabilities debug80 uses today:

1. **Subprocess assembly** — given a source file, produce HEX + LST artifacts on disk.
2. **In-process compilation** (optional) — given source text, return segments and anchors
   for extra listing fallback.

### Proposed interface

Create a new file `src/debug/assembler-backend.ts`:

```typescript
import type { AssembleResult } from './assembler';
import type { MappingParseResult } from '../mapping/parser';

/**
 * Represents a pluggable assembler backend for debug80.
 *
 * Every backend must implement `assemble()`. The optional `compileMappingInProcess()`
 * method enables the extra-listing fallback path in mapping-service.ts. Backends that
 * cannot compile in-process simply omit it, and the fallback path will parse the LST
 * directly instead.
 */
export interface AssemblerBackend {
  /** Short identifier for this backend (e.g. 'asm80', 'zax'). Used in logs and config. */
  readonly id: string;

  /**
   * Assemble a source file to produce HEX and LST artifacts.
   *
   * On success the backend must ensure:
   * - `hexPath` exists and contains valid Intel HEX.
   * - `listingPath` exists and contains an asm80-compatible listing.
   *
   * @returns An AssembleResult indicating success or failure.
   */
  assemble(options: AssembleOptions): AssembleResult;

  /**
   * Optional: assemble a source file to produce a binary output with address bounds.
   *
   * Only required for backends that support the `simple` platform's BINFROM/BINTO
   * binary pass. Backends that do not support binary output should omit this method;
   * the launch pipeline will skip the binary pass.
   */
  assembleBin?(options: AssembleBinOptions): AssembleResult;

  /**
   * Optional: compile source text in-process and return mapping data.
   *
   * This is used by the extra-listing fallback in mapping-service.ts when a .lst file
   * exists but lacks source location info. If the backend does not implement this,
   * the mapping service falls back to parsing the LST text directly.
   */
  compileMappingInProcess?(sourcePath: string, baseDir: string): MappingParseResult | undefined;
}

export interface AssembleOptions {
  /** Absolute path to the assembly source file. */
  asmPath: string;
  /** Absolute path where the HEX output should be written. */
  hexPath: string;
  /** Absolute path where the listing output should be written. */
  listingPath: string;
  /** Optional callback for streaming assembler output to the debug console. */
  onOutput?: (message: string) => void;
}

export interface AssembleBinOptions {
   /** Absolute path to the assembly source file. */
   asmPath: string;
   /** Absolute path used to derive the output binary path. */
   hexPath: string;
  /** Start address for binary output. */
  binFrom: number;
  /** End address for binary output. */
  binTo: number;
   /** Optional callback for streaming assembler output to the debug console. */
   onOutput?: (message: string) => void;
}
```

### Design rationale

The interface is deliberately minimal. It mirrors what debug80 already does, expressed
as a contract rather than inline asm80 calls. `AssembleResult` is reused from the existing
`assembler.ts` — no new result type is needed. `compileMappingInProcess` is optional because
not every backend will have an in-process compiler; the existing LST parsing fallback
remains available.

---

## Asm80 Backend Implementation

Move existing asm80-specific code into `src/debug/asm80-backend.ts`. This file implements
`AssemblerBackend` by delegating to the current functions in `assembler.ts`.

### Structure

```
src/debug/asm80-backend.ts
```

This module should:

1. Import `resolveAsm80Command`, `runAssembler`, `runAssemblerBin` from `./assembler`.
2. Import `asm80Module` and `asm80Monolith` (currently in `mapping-service.ts`).
3. Implement `AssemblerBackend` with `id: 'asm80'`.
4. `assemble()` delegates to `runAssembler()`.
5. `assembleBin()` delegates to `runAssemblerBin()`.
6. `compileMappingInProcess()` contains the logic currently in `buildAsm80Mapping()`
   from `mapping-service.ts` (lines 371–449).

The existing `assembler.ts` file retains its current exports — it becomes the asm80-specific
implementation detail, and `asm80-backend.ts` wraps it. This avoids a large disruptive rename
and keeps the diff reviewable.

---

## Backend Resolution

Create a backend resolver in `src/debug/assembler-backend.ts` (same file as the interface):

```typescript
import { Asm80Backend } from './asm80-backend';

/**
 * Resolves the assembler backend for a given launch configuration.
 *
 * Selection logic (in priority order):
 * 1. Explicit `assembler` field in launch args (e.g. "asm80", "zax").
 * 2. Source file extension: .zax → zax backend (future), .asm → asm80.
 * 3. Default: asm80.
 */
export function resolveAssemblerBackend(
  assembler: string | undefined,
  asmPath: string | undefined
): AssemblerBackend {
  const id = assembler?.toLowerCase();

  if (id === 'asm80' || id === undefined) {
    return new Asm80Backend();
  }

  // Future: if (id === 'zax') return new ZaxBackend();

  throw new Error(`Unknown assembler backend: "${assembler}"`);
}
```

For this issue, only `asm80` needs to resolve. The `zax` case is a placeholder comment
that will be filled in by issue #79. The extension-based detection (`asmPath` ending in
`.zax`) should also be deferred to #79/#81 — for now, `asmPath` is accepted but unused.

---

## Launch Config Schema Change

Add an `assembler` property to the debug configuration schema in `package.json`:

```json
"assembler": {
  "type": "string",
  "description": "Assembler backend to use (default: asm80)",
  "enum": ["asm80"],
  "default": "asm80"
}
```

Also add `assembler` to the `LaunchRequestArguments` interface in `src/debug/types.ts`:

```typescript
/** Assembler backend to use (default: asm80) */
assembler?: string;
```

Add the same optional field to `ProjectConfig` so the TypeScript config model matches the
debug schema and the values merged by `populateFromConfig()`.

Update all description strings in `package.json` that say "asm80" to be backend-neutral
where appropriate. Specifically:

- `"Root asm file to assemble with asm80"` → `"Root assembly source file"`
- `"Run asm80 before launch when asm is provided"` → `"Run the assembler before launch when asm is provided"`
- `"Launch and debug a Z80 program from HEX/LST (asm80-generated)"` → `"Launch and debug a Z80 program from HEX/LST"`

---

## Wiring Changes

### `launch-pipeline.ts`

`assembleIfRequested()` currently imports and calls `runAssembler` / `runAssemblerBin`
directly. After this refactor:

1. Accept an `AssemblerBackend` parameter (or resolve it internally from `args.assembler`
   and `asmPath`).
2. Call `backend.assemble(...)` instead of `runAssembler(...)`.
3. Call `backend.assembleBin?.(...)` instead of `runAssemblerBin(...)` — skip if the method
   is not present.
4. Update the error message from `'asm80 failed to assemble'` to
   `` `${backend.id} failed to assemble` ``.

### `mapping-service.ts`

`buildExtraListingMapping()` currently calls `buildAsm80Mapping()` directly. After this
refactor:

1. `buildMappingFromListing()` and `loadExtraListingMapping()` should accept an optional
   `AssemblerBackend` parameter.
2. `buildExtraListingMapping()` calls `backend.compileMappingInProcess?.(sourcePath, baseDir)`
   instead of `buildAsm80Mapping(sourcePath, service)`.
3. If the backend does not implement `compileMappingInProcess`, fall through to the existing
   LST parsing path (which already exists as the else-branch).
4. Remove the top-level `import * as asm80Module` and `import * as asm80Monolith` from
   `mapping-service.ts` — those imports move to `asm80-backend.ts`.
5. Delete the `buildAsm80Mapping()` function from `mapping-service.ts`.

### `source-manager.ts`

`buildMappingFromListing()` is also called from `SourceManager`. Keep the new backend
parameter optional so `SourceManager` does not need to resolve a backend for this refactor.
That preserves the current call shape outside the launch path while still adding the seam
needed by `adapter.ts`.

### `adapter.ts`

The adapter orchestrates the launch. It should:

1. After resolving launch args, call `resolveAssemblerBackend(args.assembler, asmPath)`.
2. Pass the resolved backend to `assembleIfRequested()`.
3. Pass the resolved backend to `buildMappingFromListing()`.

---

## File Plan

| Action | File | Notes |
|--------|------|-------|
| **Create** | `src/debug/assembler-backend.ts` | Interface + `resolveAssemblerBackend()` |
| **Create** | `src/debug/asm80-backend.ts` | `Asm80Backend` implements `AssemblerBackend` |
| **Edit** | `src/debug/launch-pipeline.ts` | Use backend.assemble() instead of direct asm80 calls |
| **Edit** | `src/debug/mapping-service.ts` | Remove asm80 imports, accept backend param, delegate |
| **Edit** | `src/debug/adapter.ts` | Resolve backend, pass to pipeline + mapping |
| **Edit** | `src/debug/types.ts` | Add `assembler?: string` to `LaunchRequestArguments` |
| **Edit** | `src/debug/launch-args.ts` | Merge `assembler` from config targets/root into launch args |
| **Edit** | `src/debug/source-manager.ts` | Keep `buildMappingFromListing()` call on the optional-backend path |
| **Edit** | `package.json` | Add `assembler` schema property, neutralise asm80 description strings |
| **Edit** | `docs/technical.md` | Update section 7 to reflect the backend abstraction |
| **Create** | `tests/debug/assembler-backend.test.ts` | Tests for `resolveAssemblerBackend()` |
| **Edit** | `tests/debug/assembler.test.ts` | Existing tests continue to pass (no interface change to assembler.ts) |
| **Edit** | `tests/debug/launch-pipeline.test.ts` | Update to pass/mock backend |
| **Edit** | `tests/debug/mapping-service.test.ts` | Update to pass/mock backend; test fallback when `compileMappingInProcess` absent |

---

## Test Requirements

### New tests (`assembler-backend.test.ts`)

1. `resolveAssemblerBackend(undefined, undefined)` returns an `Asm80Backend`.
2. `resolveAssemblerBackend('asm80', undefined)` returns an `Asm80Backend`.
3. `resolveAssemblerBackend('ASM80', undefined)` returns an `Asm80Backend` (case-insensitive).
4. `resolveAssemblerBackend('unknown', undefined)` throws with "Unknown assembler backend".

### Updated tests (`launch-pipeline.test.ts`)

5. `assembleIfRequested` with a mock backend calls `backend.assemble()`.
6. `assembleIfRequested` with a backend that has `assembleBin` calls it for simple platform.
7. `assembleIfRequested` with a backend lacking `assembleBin` skips binary pass without error.
8. Error message includes `backend.id`.

### Updated tests (`mapping-service.test.ts`)

9. Extra listing with backend that implements `compileMappingInProcess` uses it.
10. Extra listing with backend lacking `compileMappingInProcess` falls back to LST parsing.

### Existing tests (`assembler.test.ts`)

11. All existing tests must pass unchanged — `assembler.ts` exports are not modified.

---

## Acceptance Criteria (from issue #78)

- [ ] asm80 functionality remains unchanged for current users.
- [ ] Assembler selection is no longer hardcoded in the launch path.
- [ ] There is a clear seam where a future `zax` backend can be added.
- [ ] Tests cover backend selection and asm80 backend behaviour.

---

## What This Does NOT Do

This refactor intentionally does not:

- Add a ZAX backend (that is #79).
- Add `.zax` file association or language support (that is #81).
- Change D8 debug map handling or prefer native maps (that is #80).
- Change any user-visible default behaviour.

The only user-visible addition is the new optional `assembler` config property, which
defaults to `"asm80"` and therefore changes nothing for existing users.
