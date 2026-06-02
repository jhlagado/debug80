/**
 * @file Test fixtures for platform-view message routing.
 */

import { vi } from 'vitest';
import type {
  PlatformViewMessageDependencies,
  PlatformViewPlatform,
} from '../../src/extension/platform-view-messages';

export function createPlatformViewDependencies(
  platform: PlatformViewPlatform | undefined
): PlatformViewMessageDependencies & Record<string, ReturnType<typeof vi.fn>> {
  return {
    handleCreateProject: vi.fn(() => undefined),
    handleOpenWorkspaceFolder: vi.fn(() => undefined),
    handleSelectProject: vi.fn(() => undefined),
    handleConfigureProject: vi.fn(() => undefined),
    handleSaveProjectConfig: vi.fn(() => undefined),
    handleSetStopOnEntry: vi.fn(() => undefined),
    handleSetAzmOptions: vi.fn(() => undefined),
    handleSelectTarget: vi.fn(() => undefined),
    handleTestCoolTermConnection: vi.fn(() => undefined),
    handleSendHexViaCoolTerm: vi.fn(() => undefined),
    handleRestartDebug: vi.fn(() => undefined),
    handleSetEntrySource: vi.fn(() => undefined),
    currentPlatform: vi.fn(() => platform),
    handleStartDebug: vi.fn(() => undefined),
    handleSerialSendFile: vi.fn(() => undefined),
    handleSerialSave: vi.fn(() => undefined),
    clearSerialBuffer: vi.fn(() => undefined),
    handleRequestProjectStatus: vi.fn(() => undefined),
    handlePlatformMessage: vi.fn(() => undefined),
  };
}

