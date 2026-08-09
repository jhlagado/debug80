# Nucleus executable proofs

Each JSON file names an AZM source fixture, its bounded memory profile, expected
observations, and measured code regions. The harness assembles and runs these
fixtures with Debug80. A proof is therefore both a behavioral check and a byte
account; estimates belong in the implementation plan, not in these manifests.

`vertical-slice-memory.json` is the shared flat 64 KiB proof layout. The Stage 7
LL(1) manifests cover the parser engine, the complete compiler path, and the
differential action surface. Earlier slice manifests remain active regression
evidence until the packed parser has absorbed their language stages.
