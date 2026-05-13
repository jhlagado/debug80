/**
 * @file Project header, target dropdown, and setup card wiring for the TEC-1G webview.
 * Re-exports the shared implementation from the common module.
 */

export type {
  ProjectStatusUiElements as Tec1gProjectStatusElements,
  ProjectStatusUi as Tec1gProjectStatusUi,
} from '../common/project-status-ui';
export { createProjectStatusUi as createTec1gProjectStatusUi } from '../common/project-status-ui';
