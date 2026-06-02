/**
 * @file Shared panel message contracts.
 */

import type { MemoryViewState } from './panel-memory';
import type { RefreshController } from './panel-refresh';

export type PanelMessage = {
  type?: string;
  code?: number;
  mode?: string;
  register?: string;
  address?: number;
  value?: string;
  allowReadOnly?: boolean;
  text?: string;
  tab?: string;
  views?: Array<{ id?: string; view?: string; after?: number; address?: number }>;
};

export type PanelSession =
  | {
      type: string;
      customRequest: (command: string, payload: unknown) => Promise<unknown> | Thenable<unknown>;
    }
  | undefined;

export type PanelMessageContext<TTab extends string> = {
  getSession: () => PanelSession;
  refreshController: RefreshController;
  autoRefreshMs: number;
  setActiveTab: (tab: TTab) => void;
  getActiveTab: () => TTab;
  isPanelVisible: () => boolean;
  memoryViews: MemoryViewState;
};

export type PanelCommands = {
  key?: string;
  reset?: string;
  speed?: string;
  serialSend?: string;
  registerWrite: string;
  memoryWrite: string;
};

export async function sendPanelCommand(
  session: Exclude<PanelSession, undefined>,
  command: string,
  payload: unknown
): Promise<boolean> {
  try {
    await session.customRequest(command, payload);
    return true;
  } catch {
    return false;
  }
}

