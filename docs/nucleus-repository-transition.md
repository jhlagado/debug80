# Nucleus repository transition

## Ownership

[Nucleus](https://github.com/jhlagado/nucleus) is the standalone authority for
the language, grammar, direct Z80 compiler, runtime contract, NOBJ format,
proofs, and Node host package. Debug80 contains no second compiler source tree.

Debug80 maintains `.nu` editor registration, launch selection, artifact loading,
debugging, and its website documentation snapshot. The extension consumes an
immutable Nucleus Git revision; language changes belong in Nucleus.

## Installed compiler boundary

Debug80 calls `createNucleusCompiler().build()` from the installed package.
Nucleus resolves leading `//% import` directives into ordered source parts and
validates the `nucleus-target/v1` profile, including the required service
addresses. Debug80's conventional `nucleus-project.json` names an entry source;
its existing rejection of old source-list project files is unchanged.

The build returns canonical NOBJ plus requested BIN, HEX, and D8 artifacts.
Debug80 currently accepts one flat-target D8 map. It validates that map before
publishing the selected output set through Tool Services' recoverable file
transaction. A malformed map leaves the previous complete build intact.
Banked launch integration remains outside this backend's current contract.

D8 source maps are implemented. Debug80 can use their source locations for its
normal breakpoint and stepping machinery; maps are not inferred from NOBJ
bytes. The bundled-extension smoke test compiles a Nucleus program through the
installed backend and checks both HEX and D8 output.

Nucleus includes its checked compiler images and pre-linked target runtime
catalogue. Production builds execute those Z80 images through standalone
Debug80 Runtime. They do not assemble Nucleus source or require an AZM checkout.
Only compiler-source verification uses a pinned development-only AZM build.

## Migration verification

The extracted histories are published before removal of their Debug80 source
copies. The extension stages Nucleus's standard library, not compiler source
or proof directories. Backend tests cover import ordering, target validation,
positioned diagnostics, selected outputs, and malformed-map preservation.

[Repository migration](repository-migration.md) records the pinned revisions,
verification results, and remaining clean-clone and packaging work. Website
snapshot updates are a separate release task; this dependency cutover does not
publish a new debug80.com documentation edition.
