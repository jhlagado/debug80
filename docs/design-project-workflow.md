# Design: Project Creation and Selection Workflow

Date: 2026-04-05
Status: Proposed
Scope: Debug80 project bootstrap, selection, target selection, and entry-point management

---

## Problem Statement

Debug80 currently assumes that the user is already inside a suitable folder, that a
project config either exists or can be inferred cheaply, and that a thin scaffold is
enough to get moving. That is workable for prepared examples, but it breaks down for
real users in these common scenarios:

- an empty VS Code window with no folder open
- an untitled workspace with one or more folders added
- a multi-root workspace where the user needs to move between projects
- a folder with assembly files but no Debug80 config
- a completely empty folder where the user wants to start from scratch
- a configured folder with multiple possible debug targets

The friction is not mainly about JSON authoring. The friction is that Debug80 does not
yet model the user workflow explicitly enough.

---

## Goals

- Let a user start from nothing: no workspace, no folder, no source files.
- Let a user work in single-folder and multi-root workspaces without hidden behavior.
- Make the active debug project and active target explicit.
- Make entry-point selection predictable and editable.
- Keep project configuration stored with the folder, not with the VS Code workspace.
- Make `F5` do the obvious thing for the current Debug80 context.
- Reduce dependence on the active editor once a project is configured.

## Non-Goals

- Managing multiple VS Code workspaces from inside Debug80.
- Supporting multiple unrelated Debug80 projects inside one folder in the first pass.
- Replacing normal VS Code file browsing or editor behavior.
- Building a full project system beyond debug bootstrap, launch, and entry-point management.

---

## VS Code Constraints

Debug80 should align with the way VS Code already works:

- One VS Code window has one workspace.
- A workspace can have zero folders, one folder, or multiple root folders.
- An untitled workspace can contain folders before being saved as a `.code-workspace` file.
- Users can have multiple VS Code windows open at once.

This means Debug80 should not try to manage multiple workspaces. It should manage
projects inside the current workspace window.

---

## Terminology

- `Workspace`: the current VS Code window state.
- `Folder`: one root folder in that workspace.
- `Debug80 project`: the Debug80 configuration owned by one folder.
- `Target`: a named debug target inside a Debug80 project.
- `Entry source`: the `asm` or `zax` file used by the active target.

The product language should prefer `project` and `folder` over `workspace` where possible.
Users usually care which project they are working on, not which VS Code abstraction is active.

---

## Proposed Model

### Project ownership

The first version of the improved model should be:

- one Debug80 project per folder
- many targets per project
- one active folder at a time in multi-root workspaces
- one active target at a time per project

This maps directly onto the current `debug80.json` structure and keeps scope under control.

### Platform UX model

Debug80 should use this user-facing platform model:

- `Project default platform`: the baseline platform for the project (`projectPlatform`).
- `Target platform override`: an optional per-target override (`targets.<name>.platform`).

UX guidance:

- project setup and project configuration panels should present and edit the project default first
- target configuration should label per-target platform as an override, not as the primary project identity
- debug and sidebar status should prefer project-level language by default, while still honoring target overrides at runtime

This keeps config flexibility without forcing new users to think in target-level terms before they need to.

### Configuration location

Debug80 project config should live in the folder:

- preferred: `.vscode/debug80.json`
- optional compatibility: `debug80.json` or `.debug80.json`

The key rule is that the project belongs to the folder, not to the workspace file. This
keeps projects portable in saved and unsaved workspaces.

### Source of truth

Once a project exists, Debug80 should treat the project config as authoritative.

- Do not guess the active entry file from the active editor.
- Do not silently switch folders in a multi-root workspace.
- Do not silently pick the first folder if a better context is available.

Inference is for bootstrap only.

---

## Scenario Matrix

### 1. Empty window, no folder

Debug80 should offer:

- `Create New Debug80 Project...`
- `Open Existing Folder...`

If the user chooses create:

1. Ask for a new folder location and project name.
2. Create the folder.
3. Offer to add it to the current window or open it in a new window.
4. Scaffold the Debug80 project into that folder.
5. Offer to create a starter source file.

### 2. Untitled workspace with folders added

Debug80 should scan all root folders and classify each as:

- configured Debug80 project
- likely assembly project without config
- empty folder
- irrelevant folder

For likely assembly folders, offer `Create Debug80 Project`.

### 3. Single-folder workspace

This is the easiest case. Debug80 should:

- show the current project state clearly
- offer project creation if config is missing
- offer entry-point setup if the config is incomplete

### 4. Multi-root workspace

Debug80 should have an explicit folder selector. The UI label should be something like:

- `Current Project`
- `Current Folder`

Avoid user-facing wording like `selected workspace folder` unless it is unavoidable.

### 5. Empty folder

Debug80 should be able to bootstrap from zero files:

1. choose platform
2. choose starter language (`asm` or `zax`)
3. create starter file
4. create project config
5. create launch config if needed

### 6. Folder with asm or zax files but no config

Debug80 should offer to create a project around those files rather than requiring the user
to know about `.vscode/debug80.json` first.

### 7. Configured project with multiple targets

Debug80 should make the active target explicit and easy to change. `F5` should launch the
active target unless the user explicitly chooses another launch configuration.

---

## Entry-Point Policy

This needs a clear and rigid rule.

### Rule 1: Once a project exists, the program file is explicit

The active target in `debug80.json` defines the program file via `sourceFile` or equivalent.

### Rule 2: Inference is bootstrap-only

Inference should only run while creating a new project or repairing an incomplete one.

### Rule 3: Prefer conventional entry names first

Bootstrap inference order:

1. `src/main.asm`
2. `src/main.zax`
3. `main.asm`
4. `main.zax`
5. the only `*.asm` file in the folder tree
6. the only `*.zax` file in the folder tree
7. if several candidates exist, ask the user
8. if no candidates exist, offer to create one

### Rule 4: Entry-point changes should be first-class

Debug80 should provide:

- `Debug80: Set Program File`
- `Debug80: Set Active Target`
- `Debug80: New ASM Source`
- `Debug80: New ZAX Source`

These actions should update project config rather than relying on ad hoc launch behavior.

---

## Project Discovery Rules

Each root folder should be scanned for these indicators, in order:

1. `.vscode/debug80.json`
2. `debug80.json`
3. `.debug80.json`
4. presence of `*.asm` or `*.zax`

Each folder then gets a derived state:

- `configured`
- `source-only`
- `empty`
- `non-project`

This state drives the UI:

- `configured`: show project and target controls
- `source-only`: offer `Create Project`
- `empty`: offer `Create Project` and `Create Starter File`
- `non-project`: remain quiet unless the user explicitly selects the folder

---

## Proposed Commands

### Bootstrap and selection

- `Debug80: Create New Project...`
- `Debug80: Create Project In Folder...`
- `Debug80: Select Current Project`
- `Debug80: Select Active Target`

### Source and entry management

- `Debug80: Set Program File`
- `Debug80: New ASM Source`
- `Debug80: New ZAX Source`
- `Debug80: Reveal Project Config`

### Launch convenience

- `Debug80: Debug Current Project`
- `Debug80: Debug Target...`

Command titles should use `project` and `target`, not raw config-file terminology.

---

## Proposed UI Surfaces

### Debug80 side panel

Show a compact status block:

- current folder
- current project state
- active target
- program file
- platform

Primary actions:

- Debug
- Select Project
- Select Target
- Set Program File
- New ASM Source
- New ZAX Source

### Welcome and empty states

#### No folder open

Show:

- Create New Project
- Open Existing Folder

#### Folder exists but no project config

Show:

- Create Project
- Create Starter ASM
- Create Starter ZAX

#### Multi-root workspace with no current project selected

Show:

- Select Current Project

The current idle message should evolve from a generic `no project found` message into a
state-aware launcher.

---

## F5 Behavior

This is a major friction point and should be made explicit.

### Current behavior

Today, launch behavior is a mixture of launch config, project config discovery, and some
fallback scaffolding. In practice, the user may still need to understand which folder is
active and which config file is being used.

### Proposed behavior

`F5` should work against the current Debug80 context.

#### If there is one configured Debug80 project in the workspace

- `F5` launches it directly.
- No project-file selection prompt is needed.

#### If there are multiple configured Debug80 projects

- If the user has already selected a current project, `F5` launches that project.
- If not, `F5` prompts once for `Current Project`, remembers that choice, and launches it.

#### If the current project has multiple targets

- `F5` launches the active target.
- If no active target is set and `defaultTarget` exists, use `defaultTarget`.
- If there is no default and several targets exist, prompt once and remember the choice.

#### If there is no project config but there are source files

- `F5` should offer `Create Project From Detected Sources`.
- It should not just fail with a config-file-oriented message.

#### If there is no folder or no source files

- `F5` should offer `Create New Project`.

### Simplifying folder choice

Yes, this can be simplified significantly.

The rule should be:

- Debug80 owns the concept of `current project`.
- The user should not need to select a config file manually for normal use.
- The selected project should be remembered per workspace window.
- The selected target should be remembered per project.

That means the common case becomes:

1. choose project once
2. choose target once if needed
3. press `F5` from then on

---

## Starter File Templates

For empty projects, Debug80 should be able to create starter files.

### Minimal ASM starter

The starter should be intentionally small and runnable. It should establish a label and at
least one obvious instruction flow so that stepping works immediately.

### Minimal ZAX starter

The starter should match the supported ZAX backend expectations and be equally small.

These templates should be created through Debug80 commands so the user can bootstrap without
manually creating files first.

---

## Proposed Data To Remember

### Workspace-scoped state

- current project folder path
- last chosen project when multiple exist

### Project-scoped state

- active target name
- last selected program file during creation flow if not yet committed

The durable source of truth should still be the project config. Remembered state is a
convenience layer only.

---

## Suggested Command Flow

### Flow A: Start from nothing

1. User opens Debug80 in an empty window.
2. Debug80 offers `Create New Project`.
3. User chooses folder and project name.
4. Debug80 asks for platform.
5. Debug80 asks whether to create ASM or ZAX starter.
6. Debug80 creates folder, source file, project config, and launch config.
7. Debug80 opens the starter file and marks it as the program file.
8. User presses `F5`.

### Flow B: Add Debug80 to an existing source folder

1. User opens a folder containing `asm` or `zax` files.
2. Debug80 detects source-only state.
3. Debug80 offers `Create Project`.
4. Debug80 proposes an inferred program file or asks the user to choose one.
5. Debug80 creates config and launch.
6. `F5` debugs the created target.

### Flow C: Multi-root workspace

1. User opens a workspace with several folders.
2. Debug80 shows `Select Current Project`.
3. User chooses one folder.
4. Debug80 shows active target for that folder.
5. `F5` debugs that folder until the user changes it.

---

## Implementation Plan

### Phase 1: Clarify and stabilize current selection behavior

- Stop defaulting to the first workspace folder for scaffold and debug actions.
- Introduce a single resolver for `current project folder`.
- Reuse remembered workspace selection consistently.
- Make launch messages project-oriented rather than config-file-oriented.

### Phase 2: Add project discovery state

- Scan root folders for config and source indicators.
- Classify folders as `configured`, `source-only`, `empty`, or `non-project`.
- Surface that state in the Debug80 panel.

### Phase 3: Replace thin scaffold with guided project creation

- Add `Create New Project...` flow for empty-window bootstrap.
- Add `Create Project In Folder...` flow for existing folders.
- Add platform selection.
- Add source language selection.
- Add starter-file creation.
- Ask for program file only when inference is ambiguous.

### Phase 4: Add target and entry management

- Add `Select Active Target`.
- Add `Set Program File`.
- Persist project and target selection.

### Phase 5: Align `F5` with Debug80 context

- If one configured project exists, launch it.
- If multiple exist, use remembered current project or prompt once.
- If no project exists, offer project creation rather than a raw error.

### Phase 6: Refine docs and onboarding

- Update README quick-start and project creation sections.
- Add screenshots or short flow examples.
- Keep external platform repos aligned with the new bootstrap model.

---

## Risks and Tradeoffs

### Risk: Too much state outside config

Mitigation:

- keep remembered state minimal
- keep config as the durable source of truth

### Risk: Confusing `project` versus `target`

Mitigation:

- always show both in the UI
- use distinct command names

### Risk: Empty-window project creation crosses into VS Code workspace management

Mitigation:

- let VS Code own the folder picker and window opening
- let Debug80 own only the project scaffold and remembered project selection

---

## Recommended Product Decision

Adopt this as the first-class model:

- one Debug80 project per folder
- many targets per project
- explicit current project selection in multi-root workspaces
- explicit active target selection
- explicit entry-source management
- bootstrap support from an empty window or empty folder
- `F5` launches the current project and active target without asking for a project file

This is enough to remove most current friction without inventing a larger project system.