---
title: Debug80 Test Guide
---

# Debug80 Test Guide

The `tests/` directory mirrors the `src/` layout so it is easy to find coverage
for each module. New tests should be placed alongside the closest matching
source folder.

## Directory Layout

```
tests/
  debug/       # src/debug
  mapping/     # src/mapping
  platforms/   # src/platforms
  z80/         # src/z80
  fixtures/    # shared test fixtures
```

## Conventions

- Use `.test.ts` filenames.
- Prefer unit tests with deterministic inputs.
- Use fixtures under `tests/fixtures` instead of inline large blobs.
- Keep tests focused on a single module or helper.

## Running Tests

```
npm test
```

For coverage:
```
npm run coverage
```

For performance smoke tests:
```
npm run perf:z80
```
