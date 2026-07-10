import type { GlimmerProgram } from '../model.js';
import { genericProfile } from './generic.js';
import { tec1gMatrixProfile } from './tec1g-mon3.js';
import type { Profile } from './types.js';

export type { Profile, ProfileContext } from './types.js';

/** Select the profile for a program's platform/display pair. */
export function profileFor(program: GlimmerProgram): Profile {
  if (program.platform === 'tec1g-mon3') {
    return tec1gMatrixProfile;
  }
  return genericProfile;
}
