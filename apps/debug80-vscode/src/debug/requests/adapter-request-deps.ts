import type { DebugProtocol } from '@vscode/debugprotocol';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import type { SourceStateManager } from '../mapping/source-state-manager';
import type { PlatformRegistry } from '../session/platform-registry';
import type { RuntimeControlContext } from '../session/runtime-control';
import type { SessionStateShape } from '../session/session-state';
import type { CommandRouter } from './command-router';
import type { VariableService } from './variable-service';

export interface AdapterRequestControllerDeps {
  threadId: number;
  breakpointManager: BreakpointManager;
  sourceState: SourceStateManager;
  sessionState: SessionStateShape;
  platformState: { active: string };
  variableService: VariableService;
  commandRouter: CommandRouter;
  platformRegistry: PlatformRegistry;
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void;
  sendEvent: (event: unknown) => void;
  getRuntimeControlContext: () => RuntimeControlContext;
}
