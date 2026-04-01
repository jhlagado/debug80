/**
 * @fileoverview asm80-backed implementation of the debug80 assembler backend interface.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as asm80Module from 'asm80/asm.js';
import * as asm80Monolith from 'asm80/monolith.js';
import type { MappingParseResult, SourceMapAnchor, SourceMapSegment } from '../mapping/parser';
import { runAssembler, runAssemblerBin } from './assembler';
import type { AssembleBinOptions, AssembleOptions, AssemblerBackend } from './assembler-backend';

export class Asm80Backend implements AssemblerBackend {
  public readonly id = 'asm80';

  assemble(options: AssembleOptions) {
    return runAssembler(options.asmPath, options.hexPath, options.listingPath, options.onOutput);
  }

  assembleBin(options: AssembleBinOptions) {
    return runAssemblerBin(
      options.asmPath,
      options.hexPath,
      options.binFrom,
      options.binTo,
      options.onOutput
    );
  }

  compileMappingInProcess(sourcePath: string, _baseDir: string): MappingParseResult | undefined {
    const sourceDir = path.dirname(sourcePath);
    const sourceText = fs.readFileSync(sourcePath, 'utf-8');

    asm80Module.fileGet((file: string, binary?: boolean) => {
      const resolved = path.resolve(sourceDir, file);
      if (!fs.existsSync(resolved)) {
        return null;
      }
      return binary === true ? fs.readFileSync(resolved) : fs.readFileSync(resolved, 'utf-8');
    });

    const [err, compiled, symbols] = asm80Module.compile(sourceText, asm80Monolith.Z80);
    if (err !== null && err !== undefined) {
      const message = typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err);
      throw new Error(message);
    }

    const lines = Array.isArray(compiled?.[0]) ? compiled[0] : [];
    const segments: SourceMapSegment[] = [];
    for (const entry of lines) {
      if (typeof entry.addr !== 'number' || !Array.isArray(entry.lens) || entry.lens.length === 0) {
        continue;
      }
      const start = entry.addr & 0xffff;
      const end = Math.min(0x10000, start + entry.lens.length);
      const file =
        typeof entry.includedFile === 'string' && entry.includedFile.length > 0
          ? path.resolve(sourceDir, entry.includedFile)
          : sourcePath;
      const lineNumber =
        typeof entry.numline === 'number' && Number.isFinite(entry.numline) ? entry.numline : null;
      segments.push({
        start,
        end,
        loc: { file, line: lineNumber },
        lst: {
          line: typeof entry.numline === 'number' ? entry.numline : 0,
          text: typeof entry.line === 'string' ? entry.line : '',
        },
        confidence: 'HIGH',
      });
    }

    const anchors: SourceMapAnchor[] = [];
    if (symbols !== null && symbols !== undefined) {
      for (const [name, entry] of Object.entries(symbols)) {
        if (!name || name.endsWith('$') || (name[0] === '_' && name[1] === '_')) {
          continue;
        }
        if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
          continue;
        }
        const defined = entry.defined;
        const fileRaw = defined?.file;
        const file =
          typeof fileRaw === 'string' && fileRaw !== '*main*' && fileRaw.length > 0
            ? path.resolve(sourceDir, fileRaw)
            : sourcePath;
        const lineNumber =
          typeof defined?.line === 'number' && Number.isFinite(defined.line) ? defined.line : 1;
        anchors.push({
          symbol: name,
          address: entry.value & 0xffff,
          file,
          line: lineNumber,
        });
      }
    }

    if (segments.length === 0 && anchors.length === 0) {
      return undefined;
    }
    return { segments, anchors };
  }
}