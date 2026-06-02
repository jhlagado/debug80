# Debug80 Documentation

This directory contains repository-local engineering notes. It is not the Debug80 user manual.
Keep durable user-facing explanations in the external Debug80 manual at
[debug80.com](https://debug80.com/), and keep only implementation references, design notes, release
process notes, and unfinished future work here.

When a document becomes historical, move it to [archive](archive/) or retire it. Avoid duplicating
how-to material that already belongs in the manual site.

## Reference

These documents describe current behavior or stable interfaces:

- [Technical overview](technical.md)
- [Platform overview](platforms.md)
- [Platform extension API](platform-extension-api.md)
- [Platform development guide](platform-development-guide.md)
- [D8 debug map format](d8-debug-map.md)
- [Timing model](timing-model.md)
- [Regression test strategy](regression-test-strategy.md)
- [Performance diagnostics](performance-diagnostics.md)
- [Release process](release-process.md)

## Active Design Notes

These are still useful for product and implementation decisions:

- [Future directions](future-directions.md)
- [Debug80 IDE UX](design-debug80-ide-ux.md)
- [Project workflow](design-project-workflow.md)
- [Platform UI runtime behavior](design-platform-ui-runtime-behaviors.md)
- [Production readiness](design-production-readiness.md)
- [Hardware serial link](design-hardware-serial-link.md)

## Platform Notes

- [TEC-1G platform notes](platforms/tec1g/README.md)
- [TEC-1G emulation review](platforms/tec1g/emulation-review.md)

## ADRs And Plans

- [ADR 0001: project workspace root control](adr/0001-project-workspace-root-control.md)
- [Platform ROM bundles plan](plans/platform-rom-bundles.md)

## Archive

The [archive](archive/) contains completed or superseded plans. These files are retained for
historical context, not as the active implementation roadmap.
