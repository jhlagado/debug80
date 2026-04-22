/**
 * Workspace persistence for TEC-1G panel checkboxes, keyed by debug target name.
 */
import { TEC1G_DEFAULT_PANEL_VISIBILITY } from '../tec1g/visibility-defaults';

export const TEC1G_UI_VISIBILITY_MEMENTO_KEY = 'debug80.tec1g.uiVisibilityByTarget' as const;

export type Tec1gVisibilityByTarget = Record<string, Record<string, boolean>>;

/**
 * Merge: defaults, then `debug80.json` adapter (`tec1g.uiVisibility`), then user memento
 * (per target). Last key wins in object spread.
 */
export function mergeTec1gPanelVisibility(
  adapter: Record<string, boolean> | undefined,
  memento: Record<string, boolean> | undefined
): Record<string, boolean> {
  return {
    ...TEC1G_DEFAULT_PANEL_VISIBILITY,
    ...adapter,
    ...memento,
  };
}

export function getMementoForTarget(
  byTarget: Tec1gVisibilityByTarget | undefined,
  targetName: string
): Record<string, boolean> | undefined {
  if (byTarget === undefined) {
    return undefined;
  }
  const row = byTarget[targetName];
  return row !== undefined && typeof row === 'object' ? { ...row } : undefined;
}
