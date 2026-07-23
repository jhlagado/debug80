import type { SourceAddressSpace, SourceAddressTransform } from '../../mapping/types';
import type { LaunchRequestArguments } from '../session/types';
import type { Tec1gBuiltRomArtifact } from './tec1g-rom-artifact-build';
import { activeSourceBackedTec1gRomArtifacts } from './tec1g-rom-artifact-plan';

export function applyTec1gRomArtifactsToLaunchArgs(
  args: LaunchRequestArguments,
  artifacts: Tec1gBuiltRomArtifact[]
): void {
  if (artifacts.length === 0) {
    return;
  }

  args.tec1g = { ...(args.tec1g ?? {}) };
  const generatedDebugMaps: string[] = [];
  const generatedDebugMapAddressSpaces: Record<string, SourceAddressSpace> = {};
  const generatedDebugMapAddressTransforms: Record<string, SourceAddressTransform> = {};
  const generatedSourceRoots: string[] = [];
  let monitorArtifactGenerated = false;
  for (const artifact of artifacts) {
    if (artifact.role === 'monitor') {
      args.tec1g.romHex = artifact.outputBin;
      monitorArtifactGenerated = true;
    } else {
      args.tec1g.expansionRomHex = artifact.outputBin;
    }

    generatedDebugMaps.push(...artifactDebugMaps(artifact));
    Object.assign(generatedDebugMapAddressSpaces, artifact.debugMapAddressSpaces ?? {});
    Object.assign(generatedDebugMapAddressTransforms, artifact.debugMapAddressTransforms ?? {});
    generatedSourceRoots.push(...artifactSourceRoots(artifact));
  }

  const existingDebugMaps = monitorArtifactGenerated
    ? (args.debugMaps ?? []).filter(shouldKeepExistingDebugMapForGeneratedMonitor)
    : (args.debugMaps ?? []);
  args.debugMaps = prependUniqueGroup(existingDebugMaps, generatedDebugMaps);
  args.debugMapAddressSpaces = {
    ...(args.debugMapAddressSpaces ?? {}),
    ...generatedDebugMapAddressSpaces,
  };
  args.debugMapAddressTransforms = {
    ...(args.debugMapAddressTransforms ?? {}),
    ...generatedDebugMapAddressTransforms,
  };
  args.sourceRoots = prependUniqueGroup(args.sourceRoots ?? [], generatedSourceRoots);
}

export function hasActiveTec1gMonitorRomArtifact(args: LaunchRequestArguments): boolean {
  return activeSourceBackedTec1gRomArtifacts(args.tec1g?.romArtifacts).some(
    (artifact) => artifact.role === 'monitor'
  );
}

export function hasActiveTec1gRomArtifacts(args: LaunchRequestArguments): boolean {
  return activeSourceBackedTec1gRomArtifacts(args.tec1g?.romArtifacts).length > 0;
}

function artifactDebugMaps(artifact: Tec1gBuiltRomArtifact): string[] {
  if (artifact.debugMaps !== undefined) {
    return artifact.debugMaps;
  }
  return artifact.outputDebugMap !== undefined ? [artifact.outputDebugMap] : [];
}

function artifactSourceRoots(artifact: Tec1gBuiltRomArtifact): string[] {
  return artifact.sourceRoots ?? [artifact.sourceRoot];
}

function prependUniqueGroup(values: string[], group: string[]): string[] {
  if (group.length === 0) {
    return values;
  }
  const uniqueGroup = group.filter((entry, index) => group.indexOf(entry) === index);
  return [...uniqueGroup, ...values.filter((existing) => !uniqueGroup.includes(existing))];
}

function shouldKeepExistingDebugMapForGeneratedMonitor(mapPath: string): boolean {
  const normalized = mapPath.split(/[\\/]+/).join('/');
  if (normalized.includes('resources/bundles/tec1g/mon3/v1/') && normalized.endsWith('.d8.json')) {
    return false;
  }
  if (normalized.includes('roms/tec1g/mon3/') && normalized.endsWith('.d8.json')) {
    return false;
  }
  return true;
}
