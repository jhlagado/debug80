; Deterministic operating-layer entry for one fully resolved target runtime.
; The provider supplies nucleus-runtime-link-context.asmi before assembling.

            .include "nucleus-runtime-link-context.asmi"

            .include "nucleus-target-runtime-link-begin.asmi"
            .include "target-z80-runtime.asm"
            .include "nucleus-target-runtime-link-end.asmi"
