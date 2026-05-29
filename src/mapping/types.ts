/**
 * @fileoverview Source-map data structures used by Debug80 and AZM D8 maps.
 */

/**
 * Confidence level for source mapping accuracy.
 * - HIGH: Exact source attribution from the assembler/debug map
 * - MEDIUM: Usable but less precise attribution
 * - LOW: Best-effort or unknown source attribution
 */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Source file location reference.
 */
export interface SourceLocation {
  /** Source file path (null if unknown) */
  file: string | null;
  /** Line number in source file (null if unknown) */
  line: number | null;
}

/**
 * Optional assembler context carried by AZM D8 segments.
 */
export interface SegmentSourceText {
  /** Assembler-provided source context line number */
  line: number;
  /** Assembler-provided source context text */
  text: string;
}

/**
 * A contiguous segment of memory with source mapping.
 */
export interface SourceMapSegment {
  /** Start address (inclusive) */
  start: number;
  /** End address (exclusive) */
  end: number;
  /** Source location reference */
  loc: SourceLocation;
  /** Assembler context for display and tie-breaking */
  lst: SegmentSourceText;
  /** Confidence level of the mapping */
  confidence: Confidence;
}

/**
 * A symbol anchor linking an address to source location.
 */
export interface SourceMapAnchor {
  /** Memory address of the symbol */
  address: number;
  /** Symbol name */
  symbol: string;
  /** Source file containing the symbol */
  file: string;
  /** Line number in the source file */
  line: number;
}

/**
 * Debug80 source-map representation after loading an AZM D8 map.
 */
export interface MappingParseResult {
  /** Memory segments with source mappings */
  segments: SourceMapSegment[];
  /** Symbol anchors for address-to-source lookup */
  anchors: SourceMapAnchor[];
}
