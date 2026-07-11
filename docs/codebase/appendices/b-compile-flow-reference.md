---
layout: default
title: 'Appendix B - Compile Flow Reference'
parent: 'Appendices'
grand_parent: 'AZM Engineering Manual'
nav_order: 2
---

[<- Appendix A](a-directory-file-reference.md) | [Appendix C ->](c-public-surface-reference.md)

# Appendix B - Compile Flow Reference

This appendix gives the compact compile-flow map.

## File-Backed Compile API

```text
compile(entryFile, options, deps)
  normalize entry path
  loadProgramNext()
    expandSourceForTooling()
      read entry source
      expand textual .include and tooling .import
      collect source texts
      collect source line comments
      attach source ownership metadata and unit ancestry
      scan logical lines
    read directive alias profiles
    build directive alias policy
    parseNextSourceItems()
      applyConditionalAssembly()
      collect op definitions
      expand op invocations
      split chained instruction lines
      tokenize and parse expressions
      parse layouts, aliases, enums, directives and instructions
  analyzeProgramNext()
    assembleProgram() for symbols
    lintCaseStyleNext()
  optionally runRegisterContracts()
    load .asmi interfaces
    parse exact and ranged RST service contracts
    build program model
    read .routine declarations and .asmi contracts
    infer summaries
    run liveness
    apply suppressions and scoped policy
    compare JSON findings against optional baseline
    build report, interface, inference and annotation artifacts
  assembleProgram()
    validateImportVisibility()
    qualifyRoutineLocalLabels()
    qualifyImportedPrivateLabels()
    buildAddressState()
    resolve internal symbols
    map display symbols
    emitProgramImage()
      resolve deferred CB bit-opcode expressions
  emitAssemblyArtifacts()
    writeBin()
    writeHex()
    writeD8m()
    writeAsm80()
  return diagnostics and in-memory artifacts
```

## CLI Flow

```text
cli.ts
  runCli(argv)
    parseCliArgs(argv)
    artifactBase()
    buildCompileOptions()
    compile()
    format diagnostics
    writeArtifacts()
      writeArtifactFiles()
    return exit code
```

## Tooling Flow

```text
loadProgramNext()
  expand source
  parse source items
  return LoadedProgramNext

analyzeProgramNext(loaded)
  assemble for symbols
  run case-style lint
  return diagnostics and symbol environment

analyzeRegisterContractsForTools(loaded)
  run register contract analysis in audit-oriented tooling mode
  return findings, candidate diagnostics and code actions
```

## Data Handoffs

| Stage              | Input                | Output                                                                         |
| ------------------ | -------------------- | ------------------------------------------------------------------------------ |
| Source loading     | entry path           | logical lines with ownership metadata, source texts, comments                  |
| Parsing            | logical lines        | source items                                                                   |
| Analysis           | source items         | diagnostics, display-symbol environment, import-visibility checks              |
| Register contracts | loaded program       | summaries, service-range boundaries, findings, reports and inference artifacts |
| Assembly           | source items         | byte map, display symbols, source segments with per-item columns               |
| Outputs            | byte map and symbols | artifacts                                                                      |
| CLI                | artifacts            | files on disk                                                                  |
