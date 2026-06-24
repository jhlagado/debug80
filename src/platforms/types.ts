/**
 * @file Platform configuration types shared across runtimes.
 */

export interface SimpleMemoryRegion {
  start: number;
  end: number;
  kind?: 'rom' | 'ram' | 'unknown';
  readOnly?: boolean;
}

export interface SimplePlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  binFrom?: number;
  binTo?: number;
}

export interface SimplePlatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  appStart: number;
  entry: number;
  binFrom: number | undefined;
  binTo: number | undefined;
}

export interface Tec1PlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs?: number;
  yieldMs?: number;
}

export interface Tec1PlatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  appStart: number;
  entry: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs: number;
  yieldMs: number;
}

export interface Tec1gPlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs?: number;
  yieldMs?: number;
  gimpSignal?: boolean;
  expansionBankHi?: boolean;
  matrixMode?: boolean;
  protectOnReset?: boolean;
  rtcEnabled?: boolean;
  sdEnabled?: boolean;
  sdImagePath?: string;
  sdHighCapacity?: boolean;
  expansionRomHex?: string;
  romArtifacts?: Tec1gRomArtifactConfig[];
  uiVisibility?: {
    tms9918?: boolean;
    glcd?: boolean;
    serial?: boolean;
    matrix?: boolean;
  };
}

export interface Tec1gPlatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  appStart: number;
  entry: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs: number;
  yieldMs: number;
  gimpSignal: boolean;
  expansionBankHi: boolean;
  matrixMode: boolean;
  protectOnReset: boolean;
  rtcEnabled: boolean;
  sdEnabled: boolean;
  sdImagePath?: string;
  sdHighCapacity: boolean;
  expansionRomHex?: string;
  tms9918Active?: boolean;
}

export type Tec1gRomArtifactRole = 'monitor' | 'expansion';

export interface Tec1gRomArtifactBankSelectConfig {
  kind?: 'tec1g-standard';
  initialBank?: number;
}

interface Tec1gRomArtifactBaseConfig {
  id: string;
  role: Tec1gRomArtifactRole;
  active?: boolean;
  address?: number;
  size?: number;
  windowAddress?: number;
  windowSize?: number;
  imageSize?: number;
  bankSize?: number;
  bankCount?: number;
  build?: boolean;
  bankSelect?: Tec1gRomArtifactBankSelectConfig;
}

export interface Tec1gSourceRomArtifactConfig extends Tec1gRomArtifactBaseConfig {
  sourceFile: string;
  outputBin: string;
  outputDebugMap?: string;
  binary?: never;
  debugMap?: never;
}

export interface Tec1gInactiveBinaryRomArtifactConfig extends Tec1gRomArtifactBaseConfig {
  active: false;
  binary: string;
  debugMap?: string;
  sourceFile?: never;
  outputBin?: never;
  outputDebugMap?: never;
}

export type Tec1gRomArtifactConfig =
  | Tec1gSourceRomArtifactConfig
  | Tec1gInactiveBinaryRomArtifactConfig;
