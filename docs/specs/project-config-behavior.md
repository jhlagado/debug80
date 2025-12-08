# Debug80 Project Config Behavior (current root-based design)

## Purpose
- Explain how `debug80.json` in the project root drives zero-config F5.
- Document discovery, launch merging, scaffolding, and error cases as implemented today.

## Key files and paths
- Project config: `debug80.json` at the workspace root (preferred), `.debug80.json`, or `.vscode/debug80.json`.
- Launch config points to it: `${workspaceFolder}/debug80.json`.
- Optional: `package.json` may contain a `debug80` block used as config.
- Scaffold command: `debug80.createProject` writes `debug80.json` to the root and `.vscode/launch.json`.

## Config discovery
- Inputs: explicit `projectConfig` in launch, then `debug80.json`, then `.debug80.json`, then `.vscode/debug80.json`, then `package.json` containing `debug80`.
- Search origin: pick directory from `args.asm` → `args.sourceFile` → `process.cwd()`.
- Search strategy: walk upward from the origin to filesystem root; first matching candidate wins.
- Limitation: in the Extension Development Host, `process.cwd()` may be the extension repo, so if no `projectConfig` and no asm/sourceFile are provided, discovery can miss the user workspace unless `debug80.json` is present where the walk starts.

## Launch flow
1) `populateFromConfig` loads/merges config (optionally per target) into launch args.
2) If no `asm`/`hex`/`listing` after merge, prompt to create `debug80.json` and error.
3) Resolve paths: if only `asm` is set, derive HEX/LST from `artifactBase` and `outputDir`.
4) Assemble: if `assemble !== false`, run `asm80` in the asm directory; otherwise expect existing HEX/LST.
5) Load HEX/LST, create runtime, honor `stopOnEntry`, and run.

## Scaffolding command (`debug80.createProject`)
- Writes `debug80.json` to the workspace root with inferred defaults (e.g., `src/main.asm`, `build/`, `artifactBase` from file stem).
- Optionally writes `.vscode/launch.json` pointing to `${workspaceFolder}/debug80.json`.
- Creates needed directories (including `.vscode` when writing launch).

## Error messages you will see
- `No asm/hex/listing provided and no debug80.json found. Add debug80.json or specify paths.` — nothing resolved.
- `Created debug80.json. Set up your default target and re-run.` — scaffolded after prompt.
- `Z80 artifacts not found. Expected HEX at "...".` — resolved paths missing.
- `asm80 not found...` — assemble requested but asm80 not installed/located.

## Expected user workflow (current)
- Keep `debug80.json` in the project root (or run the scaffold command to generate it and `.vscode/launch.json`).
- Use the launch that references `${workspaceFolder}/debug80.json`.
- Let the adapter assemble (default) or set `assemble: false` with existing HEX/LST.

## Current limitations to remember
- Root-based discovery depends on the search origin; without `projectConfig` and without `asm`/`sourceFile`, `process.cwd()` might not be the user workspace in extension host scenarios.
- Auto-inference from the active editor is minimal; real zero-config relies on `debug80.json` being present or launch args providing paths.
