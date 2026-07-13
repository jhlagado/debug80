# Release 0.6 Work Plan - Scheduling Contracts and Behavioural Confidence

Prepared 2026-07-13. Glimmer 0.5 completed the AZM 0.3 migration and native
Debug80 source-debugging line. Since that release, Debug80 has delivered the
stable ESM `@jhlagado/debug80-runtime/headless` API and deterministic AZM,
Dot, Tetro, and Sprite Chase scenarios. Version 0.6 turns that foundation into
a release gate and closes the ambiguity around effect order.

This is a correctness release, not a language-expansion release. It adds no new
block kind, resource, profile, or body syntax.

## The line

0.6.0 is done when Glimmer can state and test one precise scheduling contract:

> Change delivery is independent of source order. Verbatim Z80 bodies still
> execute against live memory in dispatch order.

The compiler must warn about declaration-visible writer overlap and reject the
navigation conflict it can prove, while preserving ordinary programs with
alternative writers.
The Debug80 headless game scenarios must pass against the workspace packages. A
real scheduling scenario must also pass in a clean consumer project using
packed AZM, Glimmer and Debug80 Runtime packages, proving the public package
surfaces. The manuals and Glimmer book must describe the same behaviour.

The minor version is justified by a new build-failing correctness diagnostic
and a tightened public language contract. Existing valid examples remain valid.

## 1. Specify the contract before changing validation

Revise the specification, language manual, engineering documentation, generated
code comments, and dependency-report wording around three separate ideas:

1. Phase order is fixed: compute, effect, render.
2. A declared update is delivered whole to later phases in the current frame,
   or whole in the next frame when any consumer is in the producer's phase or an
   earlier phase.
3. Block bodies execute sequentially against live memory. The runtime does not
   provide snapshots, transactions, fixed-point recomputation, or inferred data
   dependencies inside assembly.

Remove unqualified claims that every render sees all transitive derivations
current or that declaration order can never affect program behaviour.

## 2. Diagnose same-frame writer overlap safely

More than one block may legitimately update a state. Dot's left and right
effects both update `DotX`; Counter's increment and decrement effects both
update `Count`; Tetro has several lifecycle writers for its board state. A
blanket multiple-writer error would reject the shipped programming model.

Report a warning when two blocks:

- run in the same phase;
- can be active under the same card scope (same card, or a global/card overlap);
- share at least one `on` trigger; and
- share at least one `updates` target.

When their shared trigger is raised, both blocks necessarily enter one dispatch
pass. Their `updates` clauses describe possible mutation but cannot prove which
conditional stores execute inside verbatim Z80, so this overlap is not by itself
a build error. The warning should identify both blocks, phase, shared trigger
and state, and should point at the later block while naming the earlier
declaration.

`goto` already becomes an implicit `updates CurrentCard`. Two same-trigger,
same-scope blocks with different unconditional `goto` targets necessarily store
different destinations, so that case is a build error. Identical destinations
are harmless. Different cards are mutually exclusive and do not conflict.
Disjoint triggers remain accepted because simultaneous arrival is possible but
not proven from the declarations; documentation carries that residual
responsibility.

## 3. Focused compiler and generator tests

Add tests for:

- same-phase updates reaching peer consumers only on the next frame;
- later-phase forwarding in the current frame;
- reordered independent declarations producing equivalent trigger scheduling;
- a same-trigger/same-target overlap warning with stable diagnostics;
- the same target with disjoint triggers remaining valid;
- the same target in mutually exclusive cards remaining valid;
- different implicit `goto` targets failing and identical targets passing;
- missing-`updates` warnings continuing to work; and
- every shipped example parsing, generating, checking, and assembling.

Tests should inspect generated assembly where the scheduling decision is the
subject and use runtime behaviour where final state is the subject.

## 4. Headless behavioural release gate

The existing Debug80 Toolchain scenarios become required 0.6 evidence:

- the AZM counter fixture proves the runtime is language-independent;
- Dot proves build, MON-3 input, named state, and matrix scanning;
- Tetro proves cards, movement, rotation, line clear, pause, game over, restart,
  LCD, HUD, sound, and matrix output; and
- Sprite Chase proves resource upload, movement, collision, score, and sustained
  TMS9918 commits.

All runs must remain bounded, deterministic, and free of VS Code/webview
processes. The toolchain root check is the authoritative behavioural gate. A
separate clean-consumer smoke packs AZM, Glimmer and Debug80 Runtime, installs
all three tarballs, checks the installed Glimmer CLI and build API, and executes
the scheduling scenario through the packed
`@jhlagado/debug80-runtime/headless` export.

Physical Tetro and Sprite Chase playtests remain release sign-off evidence for
real display, sound, input, brightness, and VDP timing. They are not replaced by
headless execution.

## 5. Documentation and publication pass

Before release:

- update the Glimmer specification and manuals with the scoped scheduling rule;
- update the Glimmer book's phase guarantee, matrix duty-cycle explanation, and
  card block-scope/optional-use explanation;
- keep generated assembly terminology consistent with the canonical description
  "reactive game language that compiles to readable Z80 assembly";
- add a 0.6.0 changelog entry and version bump only after implementation and
  verification are complete; and
- pack the npm artifact and verify the installed ESM CLI/build API from a clean
  temporary project.

## Explicitly out

- source-level routine contract clauses;
- joystick binding syntax;
- new profile service interfaces or hardware profiles;
- namespaced `.glim` libraries;
- transactional state, state double-buffering, automatic effect sorting, or
  fixed-point cascades;
- new showcase games; and
- a second Debug80 runner CLI when the public ESM API already serves the release
  scenarios.

## Order

Contract wording and negative examples -> conflict analysis -> focused tests ->
headless regression -> book/manual correction -> full toolchain gate -> package
and release metadata.

## Completion gate

0.6.0 may be tagged when:

- all Glimmer package checks pass;
- all examples build and their generated snapshots are intentional;
- the Debug80 Toolchain root check passes on two consecutive clean runs;
- the packed AZM, Glimmer and Debug80 Runtime scheduling smoke passes;
- documentation contains no unqualified snapshot or declaration-order promise;
  and
- hardware playtest status is recorded, with any findings either fixed or
  explicitly classified as post-release hardware maintenance.

## Status - 2026-07-13: complete, pending tag

The scoped scheduling contract, overlap warning and ambiguous-navigation error
are implemented and covered by parser and generator tests. A Debug80 headless
scheduling fixture proves one-frame peer delivery in executed Z80 alongside the
Dot, Tetro and Sprite Chase scenarios. Package documentation and the Glimmer
book use the same trigger, live-memory, card-scope and matrix-duty-cycle model.

Fallow reports no new issues in the changed files, package checks and the full
Debug80 Toolchain gate pass, and package metadata is prepared for 0.6.0.
Physical Tetro and Sprite Chase playtests are recorded as post-release hardware
maintenance rather than claimed as automated evidence.
