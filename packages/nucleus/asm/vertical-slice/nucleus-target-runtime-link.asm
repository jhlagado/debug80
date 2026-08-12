; Deterministic operating-layer entry for one fully resolved target runtime.
; The provider supplies nucleus-runtime-link-context.asmi before assembling.

            .include "nucleus-runtime-link-context.asmi"

            .org RuntimeLinkBase
RuntimeCodeStart:
            .include "target-z80-runtime.asm"
RuntimeCodeEnd:
