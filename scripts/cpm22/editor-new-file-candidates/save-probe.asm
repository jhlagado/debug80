; Full native editor candidate: determine first-save status by probing the
; selected name when save begins. This is executable so its collision behavior
; can be measured rather than assumed.

CandidatePersistent .equ 0
CandidateProbe      .equ 1
CandidateSeparate   .equ 0
CandidateBaseline   .equ 0

            .include "full-editor.asmi"
