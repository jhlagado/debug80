/**
 * @fileoverview D8 debug map contract validation.
 * Reports quality warnings that indicate problems in the D8 producer (e.g. ZAX)
 * without rejecting the map outright.
 */

import type { D8DebugMap, D8Segment } from './d8-map';

export interface D8ValidationWarning {
  file: string;
  segmentIndex: number;
  message: string;
  start: number;
  end: number;
}

export function validateD8Segments(map: D8DebugMap): D8ValidationWarning[] {
  const warnings: D8ValidationWarning[] = [];

  for (const [fileKey, entry] of Object.entries(map.files)) {
    const segments = entry.segments;
    if (!segments || segments.length === 0) {
      continue;
    }

    for (let i = 0; i < segments.length; i++) {
      const seg: D8Segment = segments[i]!;

      if (seg.lstLine === 0) {
        warnings.push({
          file: fileKey,
          segmentIndex: i,
          message: `lstLine=0 is an invalid 1-based line number (segment 0x${seg.start.toString(16)}-0x${seg.end.toString(16)})`,
          start: seg.start,
          end: seg.end,
        });
      }

      if (seg.line !== undefined && seg.line !== null && seg.line < 1) {
        warnings.push({
          file: fileKey,
          segmentIndex: i,
          message: `line=${seg.line} is an invalid 1-based line number (segment 0x${seg.start.toString(16)}-0x${seg.end.toString(16)})`,
          start: seg.start,
          end: seg.end,
        });
      }

      if (seg.end <= seg.start) {
        warnings.push({
          file: fileKey,
          segmentIndex: i,
          message: `empty or inverted range: start=0x${seg.start.toString(16)} end=0x${seg.end.toString(16)}`,
          start: seg.start,
          end: seg.end,
        });
      }
    }

    for (let i = 0; i < segments.length; i++) {
      const wide: D8Segment = segments[i]!;
      const wideSpan = wide.end - wide.start;
      if (wideSpan < 16) {
        continue;
      }
      const wideHasLine = wide.line !== undefined && wide.line !== null && wide.line >= 1;
      if (wideHasLine) {
        continue;
      }
      for (let j = 0; j < segments.length; j++) {
        if (i === j) {
          continue;
        }
        const narrow: D8Segment = segments[j]!;
        if (narrow.start >= wide.start && narrow.end <= wide.end) {
          const narrowHasLine =
            narrow.line !== undefined && narrow.line !== null && narrow.line >= 1;
          if (narrowHasLine) {
            warnings.push({
              file: fileKey,
              segmentIndex: i,
              message:
                `wide segment 0x${wide.start.toString(16)}-0x${wide.end.toString(16)} (no valid line) ` +
                `shadows narrower segment 0x${narrow.start.toString(16)}-0x${narrow.end.toString(16)} ` +
                `(line=${narrow.line})`,
              start: wide.start,
              end: wide.end,
            });
            break;
          }
        }
      }
    }
  }

  return warnings;
}
