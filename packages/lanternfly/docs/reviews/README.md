# Lanternfly planning reviews

This directory holds non-normative reviews of Lanternfly and Candlemoth
planning documents. The reviews give planning and implementation agents a
stable place to find objections, questions and suggested repairs without
mixing commentary into the specification.

The governing documents remain the authority. A review finding changes the
plan only when the responsible agent incorporates it into those documents or
records a different decision there.

## Scope

The reviewer working through this directory provides architectural,
conformance, sequencing and editorial oversight during the planning phase. The
reviewer writes review notes here and does not write compiler code or edit the
governing Lanternfly documents unless the user explicitly requests that work.
The planning and coding agent remains responsible for accepting, rejecting or
adapting each finding and for changing the authoritative documents.

## Working convention

- Each review names the documents and draft state it examined.
- Findings are ordered by consequence. `Blocking` means that implementation
  would otherwise depend on an unresolved or contradictory rule.
- Each finding gives the evidence, the consequence and the smallest credible
  repair.
- When the governing documents settle a finding, change its status to
  `Resolved` and briefly identify the decision. Keep rejected advice with the
  reason for rejection so another reviewer does not raise it as new work.

## Current review

- [Candlemoth bootstrap review](candlemoth-bootstrap-review.md)
- [Candlemoth Phase 1 review](candlemoth-phase1-review.md)
