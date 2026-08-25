; Full native editor candidate: one persistent new-buffer flag and a shared
; first-save branch.

CandidatePersistent .equ 1
CandidateProbe      .equ 0
CandidateSeparate   .equ 0
CandidateBaseline   .equ 0

            .include "full-editor.asmi"
