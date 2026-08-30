import { compile } from "@jhlagado/azm/compile";

export async function assembleLegacyAzmBinary(sourcePath) {
  const current = await compile(sourcePath, { outputType: "bin" });
  const diagnostics = current.diagnostics.filter(
    ({ severity }) => severity === "error",
  );
  const bytes = current.artifacts.find(({ kind }) => kind === "bin")?.bytes;
  return Object.freeze({
    current,
    diagnostics,
    bytes,
  });
}
