# Debug80 IDE UX Evolution

Date: 2026-04-30
Status: Draft
Scope: Working design document for incremental UX improvements to the Debug80 IDE surface inside VS Code.

## Purpose

This document captures design direction for the Debug80 IDE user experience going forward.
It is intentionally not a delivery plan, ticket list, or implementation schedule yet.
Its role is to accumulate design decisions, alternatives, tradeoffs, and open questions as the UX is refined.

The current system is already usable and materially improved, but it still has some layout friction,
state-model quirks, and discoverability issues. The goal of this document is to improve the interface
without destabilizing the debugger or overcomplicating the extension architecture.

## Current Baseline

At the time of writing, the Debug80 IDE is primarily delivered through a single Debug80 webview view
inside the VS Code debug container. Within that view, the platform experience is split into two major
areas presented as tabs:

- `UI`
- `CPU`

This design has a clear weakness: the two major information areas compete for the same space, so the
user cannot see both at once. This is especially limiting now that Debug80 is being used alongside
the standard VS Code debug widgets in the same debug panel area.

## Design Goal

The next stage of Debug80 UX should:

- allow more than one Debug80 information area to be visible at once
- preserve a coherent single Debug80 surface
- avoid unnecessary extension complexity
- support later refinement of registers, memory, project controls, and other sub-areas
- stay consistent with the VS Code debug environment rather than fighting it

## Option A: Multiple First-Class Debug Views

One option is to split Debug80 into multiple VS Code views contributed into the debug container, for example:

- `Debug80 UI`
- `Debug80 CPU`
- later possibly `Debug80 Memory`, `Debug80 Serial`, or `Debug80 Project`

### Feasibility

This is feasible with current VS Code extension APIs. VS Code supports contributing multiple views into
existing view containers, including the built-in debug container, and those views can be webview views.

### Advantages

- native fit with the debug panel model
- independent collapse and expansion
- multiple panels visible simultaneously
- panels can be reordered or repositioned by the user using normal VS Code view behavior

### Disadvantages

- more extension complexity
- more webview lifecycle/state management
- more synchronization between views
- higher risk of duplicated controls or duplicated state
- more work to keep session status, selectors, and platform state coherent

### Assessment

This is a valid long-term direction if Debug80 eventually grows into several genuinely separate tools.
It is not the preferred immediate direction.

## Option B: Single Debug80 View with Internal Accordion

The preferred alternative is to keep Debug80 as one VS Code view, but replace the current tabbed structure
with an internal accordion layout managed by Debug80 itself.

Instead of forcing the user to switch between `UI` and `CPU`, the Debug80 view would contain collapsible
sections such as:

- `UI`
- `CPU`

and the `CPU` section can later be decomposed further into:

- `Registers`
- `Memory`

This creates a second-level accordion model:

- the outer VS Code debug container controls whether the whole Debug80 view is visible
- the inner Debug80 accordion controls which Debug80 sections are visible

### Advantages

- lower implementation risk than multi-view decomposition
- one webview lifecycle
- one source of truth for project/session/platform state
- allows multiple Debug80 sections to remain visible at once
- easier to extend incrementally
- avoids prematurely freezing the UX into too many first-class VS Code views

### Disadvantages

- slightly less native than true multi-view decomposition
- the internal layout remains custom and must be maintained by Debug80
- if the single view becomes too dense, it may eventually need to split later anyway

### Assessment

This is the recommended direction for the next stage of Debug80 IDE UX.

It solves the main usability problem with the current `UI` / `CPU` tabs while preserving architectural simplicity.

## Recommended Direction

Adopt Option B first:

- keep a single `Debug80` VS Code view
- replace the top-level `UI` / `CPU` tabs with accordion sections
- allow multiple sections to be open simultaneously
- plan for `CPU` to be further decomposed over time, starting with separate `Registers` and `Memory` sections

This should be treated as the default design path unless later evidence shows that the single-view surface
has become too dense or too heterogeneous.

If that happens, some internal accordion sections can later be promoted into first-class VS Code views.

## Initial Accordion Shape

The first likely target shape is:

- `UI`
- `CPU`
  - `Registers`
  - `Memory`

This should not be implemented as tabs disguised as accordions. The value comes from allowing more than one
section to remain open at the same time.

## Why Registers and Memory Should Separate

Registers and memory are both currently part of the broader CPU area, but they support different workflows:

- registers are small, high-signal, and frequently glanced at
- memory is larger, denser, and likely to evolve into a more interactive editor/inspector

Separating them is useful because it allows:

- focused redesign of registers without disturbing memory
- focused redesign of memory without disturbing registers
- independent collapse behavior
- clearer incremental work later

## Implementation Shape

At a high level, the likely implementation path is:

1. replace the current top-level tab switch with accordion sections
2. preserve current data flow and state as much as possible
3. split the current CPU area into internal subsections
4. refine each subsection one at a time

This should be approached as a layout refactor first, not as a behavioral redesign of all sub-panels at once.

## Constraints

The UX should continue to respect these constraints:

- project/session/platform state should remain unified
- controls should not be duplicated unnecessarily
- the panel should remain usable in the debug container and when moved to the secondary sidebar
- layout complexity should not outrun test coverage
- future growth should remain possible without forcing an early architecture split

## Open Questions

These questions are intentionally left open for later additions:

- Should the accordion allow multiple sections open at once, or enforce one-open-at-a-time behavior?
- Should `CPU` remain a parent section once `Registers` and `Memory` are separated, or should all three become siblings?
- Should session status, project selectors, and restart controls stay pinned above all accordion sections?
- At what point would a section deserve promotion into its own first-class VS Code debug view?

## Investigation: Project Picker State Loss

There is a recurring UI state bug in the current project header.

### Observed Behavior

The project picker can temporarily lose its visible selected state even though:

- the underlying project is still selected
- the target is still valid
- the debug session still works
- the rest of the panel state appears to remain intact

The failure mode reported so far is:

- after switching away from VS Code and returning later, the project picker can render as if no project is selected
- the UI can fall back to an `Open Folder` / empty-state style presentation
- clicking the selector often restores the correct visible state immediately

This indicates a mismatch between the actual extension-side selected workspace state and the webview's rendered project-header state.

### Current Hypothesis

This currently looks more like a rehydration or partial-status-render issue than a true loss of project/session state.

The likely seam is the project-header status flow:

- extension side computes `projectStatus`
- webview side applies that payload through its own project-root button/controller state
- the project-root button has fallback behavior when `rootPath` or selected-root information is missing

This issue should be investigated as a webview visibility/state-refresh problem, especially around:

- panel visibility changes
- window focus loss and return
- webview reactivation or redraw
- partial `projectStatus` payloads
- fallback behavior when selected workspace is temporarily unresolved

### Why It Matters

This is a usability problem rather than a cosmetic detail.

The project picker is the user's top-level orientation control. When it visually falls back to an
empty-state presentation while the actual project remains active, it makes the whole IDE feel unstable
and undermines trust in the state model.

### Design Constraint

The rendered project picker must be treated as a stable reflection of extension state.

Losing the visible selected project while the active project remains valid is not acceptable behavior.

### Follow-Up

This should remain an explicit investigation item until the root cause is understood. It should not be
rolled into broader layout work silently.

## Current Decision

Current design decision:

- reject a first-pass split into multiple first-class VS Code debug views
- proceed conceptually with a single Debug80 view using internal accordion sections
- plan to separate registers from memory as part of that direction

## Change Log

- 2026-04-30: Initial draft created. Captures the `multiple debug views` alternative, the `single-view accordion` alternative, and the current preference for the accordion approach.
