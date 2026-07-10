/**
 * MON-3 keypad input, shared by every TEC-1G profile regardless of
 * display: _scanKeys polling (rising edges from the carry flag, held
 * autorepeat from the zero flag), the API and key-code equates, and
 * the held-binding scratch cells.
 */

import type { Binding, GlimmerProgram } from '../model.js';
import { TEC1G_KEY_CODES } from '../model.js';
import { hex } from '../emit.js';

export function emitMon3ApiEquates(emit: (line?: string) => void): void {
  emit(`${'ApiScanKeys'.padEnd(17)} .equ 16`);
  emit(`${'ApiRandom'.padEnd(17)} .equ 49   ; A = random byte, destroys B`);
}

export function emitMon3KeyCodeEquates(
  program: GlimmerProgram,
  emit: (line?: string) => void,
): void {
  const usedKeys = [...new Set(program.bindings.map((b) => b.key))];
  if (usedKeys.length > 0) {
    emit('; --- MON-3 key codes ---');
    for (const key of usedKeys) {
      emit(`${key.padEnd(17)} .equ ${hex(TEC1G_KEY_CODES.get(key) ?? 0, 2)}`);
    }
    emit();
  }
}

export function emitMon3HeldStorage(
  emit: (line?: string) => void,
  heldBindings: Binding[],
): void {
  if (heldBindings.length > 0) {
    emit(`${'Glim_HeldKey:'.padEnd(17)} .db $FF`);
    emit(`${'Glim_HeldCount:'.padEnd(17)} .db 0`);
  }
}

/**
 * tec1g-mon3 input polling via MON-3 _scanKeys (RST $10, C=16):
 * Z = key pressed (code in A), carry = new press. Rising bindings fire on
 * new presses only. Held bindings also autorepeat: the first press fires
 * and arms Glim_HeldKey/Glim_HeldCount; while the same key stays down,
 * the counter reloads and refires every `period` frames.
 */
export function emitTec1gPollBindings(
  program: GlimmerProgram,
  hasHeld: boolean,
  emit: (line?: string) => void,
  op: (text: string) => void,
  raiseChanged: (cellName: string) => void,
): void {
  emit('; --- input polling (MON-3 _scanKeys) ---');
  emit('@__PollBindings:');
  if (program.bindings.length === 0) {
    op('ret');
    emit();
    return;
  }
  op('ld      c,ApiScanKeys');
  op('rst     $10');
  if (hasHeld) {
    op('jr      z,__PollKeyDown');
    op('ld      a,$FF                ; no key: disarm autorepeat');
    op('ld      (Glim_HeldKey),a');
    op('ret');
    emit('__PollKeyDown:');
    op('ld      b,a                  ; B = key code (DE unsafe: matrix kbd)');
    op('jr      c,__PollNewPress');
    op('ld      a,(Glim_HeldKey)     ; held: autorepeat armed for this key?');
    op('cp      b');
    op('ret     nz');
    op('ld      a,(Glim_HeldCount)');
    op('dec     a');
    op('ld      (Glim_HeldCount),a');
    op('ret     nz');
    for (const binding of program.bindings) {
      if (binding.edge !== 'held') continue;
      const tag = `${binding.target}_${binding.key}`;
      op('ld      a,b');
      op(`cp      ${binding.key}`);
      op(`jr      nz,__HeldNext_${tag}`);
      op(`ld      a,${binding.period}`);
      op('ld      (Glim_HeldCount),a');
      op('ld      a,1');
      op(`ld      (${binding.target}),a`);
      raiseChanged(binding.target);
      op('ret');
      emit(`__HeldNext_${tag}:`);
    }
    op('ret');
    emit('__PollNewPress:');
  } else {
    op('ret     nz                   ; no key pressed');
    op('ret     nc                   ; key held, not a new press');
    op('ld      b,a                  ; B = key code (DE unsafe: matrix kbd)');
  }
  for (const binding of program.bindings) {
    const tag = `${binding.target}_${binding.key}`;
    op('ld      a,b');
    op(`cp      ${binding.key}`);
    op(`jr      nz,__NewNext_${tag}`);
    if (binding.edge === 'held') {
      op('ld      a,b                  ; arm autorepeat');
      op('ld      (Glim_HeldKey),a');
      op(`ld      a,${binding.period}`);
      op('ld      (Glim_HeldCount),a');
    }
    op('ld      a,1');
    op(`ld      (${binding.target}),a`);
    raiseChanged(binding.target);
    op('ret');
    emit(`__NewNext_${tag}:`);
  }
  op('ret');
  emit();
}
