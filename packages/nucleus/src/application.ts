import type {
  SourceLimits,
  SourcePlacement,
} from "@jhlagado/z80-tool-services/source-preparation";

import {
  prepareNucleusSourceParts,
  type NucleusResolvedSourceProject,
} from "./source-preparation.js";
import {
  defaultRuntimeLinkContext,
  nucleusRuntimeServiceVectorBytes,
} from "./nucleus-runtime.js";
import type { RuntimeLinkContext, RuntimeServiceAddresses } from "./nobj.js";
import {
  createNucleusHostRuntimeStreamLink,
  NUCLEUS_HOST_RUNTIME_STREAM_STUB_SPACING,
  type NucleusHostRuntimeStreamStub,
} from "./runtime-stream-adapter.js";
import type { SourcePart } from "./source-manifest.js";

export type NucleusRuntimeServiceSelection =
  | {
      readonly kind: "resident";
    }
  | {
      readonly kind: "host-streams";
      readonly stubBase: number;
      readonly stubSpacing?: number;
    };

export interface NucleusRuntimeLinkPreparationOptions {
  readonly runtimeLinkContext?: RuntimeLinkContext;
  readonly services?: NucleusRuntimeServiceSelection;
}

export interface NucleusCompilationPreparationOptions {
  readonly root: string;
  readonly entry: string;
  readonly placement?: SourcePlacement;
  readonly limits?: SourceLimits;
  readonly runtime?: NucleusRuntimeLinkPreparationOptions;
}

export interface PreparedNucleusHostRuntimeStreams {
  readonly stubBase: number;
  readonly stubSpacing: number;
  readonly serviceAddresses: RuntimeServiceAddresses;
  readonly vectorBytes: Uint8Array;
  readonly stubs: readonly NucleusHostRuntimeStreamStub[];
}

export interface PreparedNucleusRuntimeLink {
  readonly serviceKind: NucleusRuntimeServiceSelection["kind"];
  readonly baseRuntimeLinkContext: RuntimeLinkContext;
  readonly runtimeLinkContext: RuntimeLinkContext;
  readonly vectorBytes: Uint8Array;
  readonly hostStreams?: PreparedNucleusHostRuntimeStreams;
}

export interface PreparedNucleusCompilation {
  readonly project: NucleusResolvedSourceProject;
  readonly sourceParts: readonly SourcePart[];
  readonly partBanks: readonly number[];
  readonly totalSourceBytes: number;
  readonly runtime: PreparedNucleusRuntimeLink;
}

const cloneRuntimeLinkContext = (
  context: RuntimeLinkContext,
): RuntimeLinkContext => ({
  ...context,
  services: { ...context.services },
});

export function prepareNucleusRuntimeLink(
  options: NucleusRuntimeLinkPreparationOptions = {},
): PreparedNucleusRuntimeLink {
  const baseRuntimeLinkContext = cloneRuntimeLinkContext(
    options.runtimeLinkContext ?? defaultRuntimeLinkContext,
  );
  const services = options.services ?? { kind: "resident" };
  if (services.kind === "resident") {
    return Object.freeze({
      serviceKind: services.kind,
      baseRuntimeLinkContext,
      runtimeLinkContext: cloneRuntimeLinkContext(baseRuntimeLinkContext),
      vectorBytes: nucleusRuntimeServiceVectorBytes(
        baseRuntimeLinkContext.services,
      ),
    });
  }

  const hostRuntime = createNucleusHostRuntimeStreamLink({
    runtimeLinkContext: baseRuntimeLinkContext,
    stubBase: services.stubBase,
    stubSpacing: services.stubSpacing,
  });
  return Object.freeze({
    serviceKind: services.kind,
    baseRuntimeLinkContext,
    runtimeLinkContext: cloneRuntimeLinkContext(hostRuntime.runtimeLinkContext),
    vectorBytes: hostRuntime.adapter.vectorBytes.slice(),
    hostStreams: Object.freeze({
      stubBase: services.stubBase,
      stubSpacing:
        services.stubSpacing ?? NUCLEUS_HOST_RUNTIME_STREAM_STUB_SPACING,
      serviceAddresses: { ...hostRuntime.adapter.serviceAddresses },
      vectorBytes: hostRuntime.adapter.vectorBytes.slice(),
      stubs: hostRuntime.adapter.stubs.map((stub) =>
        Object.freeze({
          service: stub.service,
          address: stub.address,
          bytes: stub.bytes.slice(),
        }),
      ),
    }),
  });
}

export async function prepareNucleusCompilation(
  options: NucleusCompilationPreparationOptions,
): Promise<PreparedNucleusCompilation> {
  const prepared = await prepareNucleusSourceParts(options);
  const runtime = prepareNucleusRuntimeLink(options.runtime);
  return Object.freeze({
    project: prepared.project,
    sourceParts: prepared.sourceParts,
    partBanks: prepared.project.bankArray,
    totalSourceBytes: prepared.sourceParts.reduce(
      (total, part) => total + part.bytes.length,
      0,
    ),
    runtime,
  });
}
