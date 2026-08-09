# Nucleus Z80 assembly

`vertical-slice/` contains the handwritten compiler and runtime together with
the executable AZM fixtures that established each implemented language stage.
The current packed LL(1) entry is assembled through
`stage7-ll1-parser.asm` and `stage7-ll1-actions.asm`; its generated grammar
tables live in [`../grammar/`](../grammar/).

Files ending in `-proof.asm` and `-measurement.asm` are not production code.
They remain here because the proof harness still assembles them against the
same source modules and uses them to detect regressions in earlier stages. The
recursive-descent Stage 7 fixture is retained only for differential comparison
with the LL(1) parser.

The corresponding manifests and memory limits live in [`../proofs/`](../proofs/).
