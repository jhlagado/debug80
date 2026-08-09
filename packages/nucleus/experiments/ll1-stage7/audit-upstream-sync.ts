import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Baseline {
  readonly commit: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, "../../../..");
const baseline = JSON.parse(
  readFileSync(path.join(here, "upstream-baseline.json"), "utf8"),
) as Baseline;

const git = (...arguments_: string[]): string =>
  execFileSync("git", arguments_, {
    cwd: repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const lines = (value: string): string[] =>
  value === "" ? [] : value.split("\n");

const seamFiles = [
  "packages/nucleus/asm/vertical-slice/aggregate-call-parser.asm",
  "packages/nucleus/asm/vertical-slice/aggregate-parser.asm",
  "packages/nucleus/asm/vertical-slice/loop-parser.asm",
  "packages/nucleus/asm/vertical-slice/structured-control-parser.asm",
  "packages/nucleus/asm/vertical-slice/typed-expression-parser.asm",
  "packages/nucleus/asm/vertical-slice/aggregate-call-z80-slice-proof.asm",
] as const;

const inheritedPrefixes = [
  "packages/nucleus/asm/vertical-slice/aggregate-call-state.asmi",
  "packages/nucleus/asm/vertical-slice/aggregate-call-z80.asm",
  "packages/nucleus/asm/vertical-slice/aggregate-z80.asm",
  "packages/nucleus/asm/vertical-slice/loop-compiler-state.asmi",
  "packages/nucleus/asm/vertical-slice/loop-keywords.asmi",
  "packages/nucleus/asm/vertical-slice/loop-semantic-sink.asm",
  "packages/nucleus/asm/vertical-slice/loop-symbols.asm",
  "packages/nucleus/asm/vertical-slice/loop-tokenizer.asm",
  "packages/nucleus/asm/vertical-slice/loop-z80-runtime.asm",
  "packages/nucleus/asm/vertical-slice/loop-z80-sink.asm",
  "packages/nucleus/asm/vertical-slice/loop-z80-state.asmi",
  "packages/nucleus/asm/vertical-slice/memory-map.asmi",
  "packages/nucleus/asm/vertical-slice/typed-expression-z80.asm",
  "packages/nucleus/asm/vertical-slice/z80-runtime.asm",
  "packages/nucleus/asm/vertical-slice/z80-sink.asm",
  "packages/nucleus/asm/vertical-slice/z80-state.asmi",
  "packages/nucleus/proofs/",
  "packages/nucleus/test/",
] as const;

const upstreamReference = "upstream/main";
let upstreamCommit: string | null = null;
try {
  upstreamCommit = git("rev-parse", upstreamReference);
} catch {
  // The report stays machine-readable when the caller has not fetched yet.
}

const upstreamFiles =
  upstreamCommit === null
    ? []
    : lines(git("diff", "--name-only", `${baseline.commit}..${upstreamCommit}`));
const intersects = (file: string, candidates: readonly string[]): boolean =>
  candidates.some((candidate) =>
    candidate.endsWith("/") ? file.startsWith(candidate) : file === candidate,
  );

const report = {
  baselineCommit: baseline.commit,
  checkoutHead: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current"),
  upstreamReference,
  upstreamCommit,
  upstreamAdvanced: upstreamCommit !== null && upstreamCommit !== baseline.commit,
  pushUrl: git("config", "--get", "remote.upstream.pushurl"),
  rerereEnabled: git("config", "--get", "rerere.enabled") === "true",
  upstreamChangedFiles: upstreamFiles,
  parserSeamChanges: upstreamFiles.filter((file) => intersects(file, seamFiles)),
  inheritedComponentChanges: upstreamFiles.filter((file) =>
    intersects(file, inheritedPrefixes),
  ),
  experimentSharedSeams: lines(
    git("diff", "--name-only", "--", ...seamFiles),
  ),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
