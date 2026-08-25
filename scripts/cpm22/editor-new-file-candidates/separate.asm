; Full native editor candidate: one persistent new-buffer flag dispatches to a
; separately assembled first-save path.

CandidatePersistent .equ 0
CandidateProbe      .equ 0
CandidateSeparate   .equ 1
CandidateBaseline   .equ 0

            .include "full-editor.asmi"
