# Edit release input

`EDIT.COM` and `manifest.json` are the published assets from
[`jhlagado/edit` v0.1.1](https://github.com/jhlagado/edit/releases/tag/v0.1.1).
`PROVENANCE.json` pins the immutable source revision and artifact digest.

Debug80 consumes this program as a bundled CP/M application. It does not own
or rebuild the editor source. `scripts/cpm22/edit-release.mjs` verifies these
files before a fresh image is assembled, and `check-edit-release.mjs` proves
that the checked-in consumer image contains the same bytes.
