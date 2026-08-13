# Nucleus Source Maps in Debug80

For each build, Debug80 requests three related artifacts from the standalone
Nucleus compiler: canonical NOBJ, launchable Intel HEX, and a native D8
source-map sidecar. The
backend publishes the three files as one generation. A missing or empty file,
a compiler diagnostic, or a publication error leaves the previous generation
unchanged.

The sidecar is written beside the HEX file with the same base name:

```text
build/main.nobj
build/main.hex
build/main.d8.json
```

The normal Debug80 D8 validator and source manager load the map. Source
breakpoints and PC-to-source lookup therefore use the same path as AZM and
Glimmer targets; the Nucleus backend does not parse compiler listings or infer
source from compiler addresses.

Nucleus records 1-based byte columns in D8. Debug80's initial Nucleus behavior
binds and steps at line granularity because the current importer does not keep
columns through every internal lookup. Column-aware stepping is a separate
change.

The standalone Node host can also compile banked targets and emit one D8 map
per physical bank. Those maps use the existing D8 memory-bank metadata and
Debug80 external address-space identity. Debug80's Nucleus application loader
currently accepts one flat Intel HEX image, so the launch backend rejects a
target profile whose `bankCount` is greater than one before invoking the
compiler. It does not flatten a banked object or invent a bank-selection
policy. Use the standalone CLI when banked NOBJ and per-bank D8 artifacts are
required.

The event protocol used to produce the sidecar is documented in the Nucleus
repository. It is active only while the host-instrumented Z80 compiler runs.
Once compilation finishes, ports `$D8..$DF` return to ordinary emulated-device
handling for target programs.
