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
  extraListings?: string[];
}

export interface SimplePlatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  appStart: number;
  entry: number;
  binFrom: number | undefined;
  binTo: number | undefined;
  extraListings?: string[];
}

export interface Tec1PlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs?: number;
  yieldMs?: number;
  extraListings?: string[];
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
  extraListings?: string[];
}

export interface Tec1gPlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs?: number;
  yieldMs?: number;
  extraListings?: string[];
  gimpSignal?: boolean;
  uiVisibility?: {
    lcd?: boolean;
    display?: boolean;
    keypad?: boolean;
    matrix?: boolean;
    glcd?: boolean;
    serial?: boolean;
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
  extraListings?: string[];
  gimpSignal: boolean;
  uiVisibility?: {
    lcd?: boolean;
    display?: boolean;
    keypad?: boolean;
    matrix?: boolean;
    glcd?: boolean;
    serial?: boolean;
  };
}
