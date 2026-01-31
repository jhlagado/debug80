# Debug80 JSDoc Guidelines

## Goals
- Make public APIs self-explanatory.
- Preserve architectural intent for future contributors.
- Keep docs short, accurate, and maintained.

## Required Structure
### File
Every file in `src/` should start with:
```ts
/**
 * @fileoverview Short description of what this module does.
 */
```

### Exported Functions
Each exported function should have:
```ts
/**
 * What it does.
 * @param arg - What this argument means
 * @returns What the function returns
 */
```

### Exported Classes
Each exported class should have:
```ts
/**
 * What this class represents.
 */
export class MyClass { ... }
```

### Notes
- Use plain language. Avoid redundant docs like “sets the value”.
- Document side effects and error cases if applicable.
- If a module exports only data, still include `@fileoverview`.

## Minimal Example
```ts
/**
 * @fileoverview Utilities for ROM path resolution.
 */

/**
 * Resolves a ROM path to an absolute file system path.
 * @param romPath - Relative or absolute path from config.
 * @returns Absolute path if resolvable.
 */
export function resolveRomPath(romPath: string): string { ... }
```
