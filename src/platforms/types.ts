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
