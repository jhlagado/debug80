/**
 * The profile seam. A profile owns everything about the generated
 * program that depends on the platform/display pair: equates, input
 * and display-service storage, file-level data tables, the main-loop
 * skeleton (pacing policy, poll call, flush/commit), the poll
 * implementation, and the resource wrappers + library at the tail.
 * The core generator owns everything reactive: change flags, timers,
 * dispatch, block wrappers, rollover.
 *
 * Working answer to the roadmap's open question: one loop skeleton
 * with profile-supplied hooks, shared primitives in profile libraries.
 */

import type { Binding, GlimmerProgram } from '../model.js';

export interface ProfileContext {
  program: GlimmerProgram;
  emit: (line?: string) => void;
  op: (text: string) => void;
  raiseChanged: (cellName: string) => void;
  /** Report a generation error at a .glim line (fails the build). */
  diagnostic: (line: number, message: string) => void;
  heldBindings: Binding[];
  /** Generic profile: key name -> input-byte bit. Empty elsewhere. */
  keyBit: Map<string, number>;
  apiBase: number;
}

export interface Profile {
  readonly name: string;
  /** Extra lines for the generated header comment (after the banner). */
  headerNote(): string[];
  /** Platform/API equates, ports, colours, key constants. */
  emitEquates(ctx: ProfileContext): void;
  /** Input scratch cells (edge shadows, held-key state) in state storage. */
  emitInputStorage(ctx: ProfileContext): void;
  /** Display/service state after the flag banks (framebuffer, shadows). */
  emitServiceStorage(ctx: ProfileContext): void;
  /** File-level data tables, above the first @ label. */
  emitDataTables(ctx: ProfileContext): void;
  /** One-time init between @Start and the MainLoop label. */
  emitLoopInit(ctx: ProfileContext): void;
  /** Top of every frame: display pacing/commit and the poll call. */
  emitFrameStart(ctx: ProfileContext): void;
  /** After the render phase, before __EndFrame (e.g. a flush call). */
  emitFrameEnd(ctx: ProfileContext): void;
  /** The @__PollBindings implementation. */
  emitPollBindings(ctx: ProfileContext): void;
  /** Resource wrappers and the profile library at the file tail. */
  emitTail(ctx: ProfileContext): void;
}
