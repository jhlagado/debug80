import {
  createNodeSourceReader,
  resolveSourceProject,
  SourcePreparationError,
  type ResolvedSourceProject,
  type SourceInspection,
  type SourceLimits,
  type SourcePlacement,
  type SourceProfile,
  type SourceSnapshot,
} from "@jhlagado/z80-tool-services/source-preparation";

import type { SourcePart } from "./source-part.js";

export interface NucleusSourcePreparationOptions {
  readonly root: string;
  readonly entry: string;
  readonly placement?: SourcePlacement;
  readonly limits?: SourceLimits;
}

export type NucleusResolvedSourceProject = ResolvedSourceProject<NucleusSourceState>;

export interface NucleusPreparedSourceParts {
  readonly project: NucleusResolvedSourceProject;
  readonly sourceParts: readonly SourcePart[];
}

export interface NucleusSourceState {
  readonly profile: "nucleus-leading-imports-v1";
}

const decoder = new TextDecoder("utf-8", { fatal: false });
const PROFILE_NAME = "nucleus-leading-imports-v1";
const IMPORT_DIRECTIVE = /^([ \t]*)\/\/%[ \t]+import[ \t]+"([^"\r\n]+)"[ \t]*$/;
const PROFILE_DIRECTIVE = /^[ \t]*\/\/%/;
const COMMENT_OR_BLANK = /^[ \t]*(?:(?:\/\/.*)?)$/;

function fail(code: string, message: string, location?: Record<string, unknown>): never {
  throw new SourcePreparationError("profile", code, message, location);
}

function lineLocation(line: number, column = 1): Readonly<Record<string, unknown>> {
  return Object.freeze({ line, column });
}

function inspectNucleusSource(
  snapshot: SourceSnapshot,
  { entry }: { readonly entry: boolean },
): SourceInspection<NucleusSourceState> {
  const text = decoder.decode(snapshot.originalBytes);
  if (/\r(?!\n)/.test(text)) {
    fail("lone-carriage-return", "Nucleus source import header contains a lone carriage return");
  }

  const dependencies = [];
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  let inHeader = true;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;
    if (!inHeader) {
      continue;
    }
    if (COMMENT_OR_BLANK.test(line)) {
      const directive = IMPORT_DIRECTIVE.exec(line);
      if (directive !== null) {
        dependencies.push(Object.freeze({
          specifier: directive[2]!,
          location: lineLocation(lineNumber, directive[1]!.length + 1),
        }));
        continue;
      }
      if (PROFILE_DIRECTIVE.test(line)) {
        fail(
          "invalid-import-directive",
          "Nucleus source preparation only accepts leading //% import \"path\" directives",
          lineLocation(lineNumber),
        );
      }
      continue;
    }
    inHeader = false;
  }

  return Object.freeze({
    ...(entry ? { state: Object.freeze({ profile: PROFILE_NAME }) } : {}),
    compilerBytes: snapshot.originalBytes,
    dependencies: Object.freeze(dependencies),
    maskedRanges: Object.freeze([]),
  });
}

export function createNucleusSourceProfile(): SourceProfile<undefined, NucleusSourceState> {
  return Object.freeze({
    inspectEntry(snapshot: SourceSnapshot) {
      return inspectNucleusSource(snapshot, { entry: true });
    },
    inspectDependency(snapshot: SourceSnapshot) {
      return inspectNucleusSource(snapshot, { entry: false });
    },
  });
}

export async function resolveNucleusProject({
  root,
  entry,
  placement = { defaultBank: 0, banks: {} },
  limits,
}: NucleusSourcePreparationOptions): Promise<NucleusResolvedSourceProject> {
  const reader = await createNodeSourceReader(root);
  return resolveSourceProject({
    reader,
    entry,
    profile: createNucleusSourceProfile(),
    configuration: undefined,
    placement,
    limits,
  });
}

export async function prepareNucleusSourceParts(
  options: NucleusSourcePreparationOptions,
): Promise<NucleusPreparedSourceParts> {
  const project = await resolveNucleusProject(options);
  return Object.freeze({
    project,
    sourceParts: Object.freeze(sourcePartsFromResolvedProject(project)),
  });
}

export function sourcePartsFromResolvedProject(project: NucleusResolvedSourceProject): SourcePart[] {
  return project.parts.map((part, index) => ({
    ordinal: index + 1,
    stableIdentity: `${index + 1}:${part.logicalIdentity}`,
    diagnosticName: part.logicalIdentity,
    bytes: part.compilerBytes,
  }));
}
