# Debug80 Large File Audit

## Current Large Files
- `src/platforms/tec1g/ui-panel-html.ts` (~1647 lines)
- `src/platforms/tec1/ui-panel-html.ts` (~1160 lines)
- `src/debug/adapter.ts` (~1130 lines)

## Recommended Next Steps
1. Split UI HTML templates into smaller helpers by panel section.
2. Extract reusable HTML fragments (buttons, displays, layout grids).
3. Continue adapter.ts extraction (RuntimeController, VariableService, etc.).

## Notes
- These files are large primarily due to HTML templates and orchestration logic.
- Changes should preserve TEC-1 compatibility and avoid heavy DOM updates.
