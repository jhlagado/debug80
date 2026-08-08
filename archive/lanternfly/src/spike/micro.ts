/**
 * The single-pass spike.
 *
 * Lanternfly is a single-pass language in the Pascal tradition, and the
 * language says so itself: **declaration before use** and **`forward`** are
 * single-pass features. A compiler that reads the whole program before
 * emitting anything needs neither. Their presence states the design's shape,
 * and an earlier version of this file did not read it — it implemented three
 * passes and proved they worked, which was the wrong question answered
 * carefully.
 *
 * One walk over the source. A forward reference is back-patched: a jump whose
 * target is not yet known is emitted with a placeholder operand and its
 * position recorded, and the placeholder is filled in when the target is
 * reached. That is what Pascal does and what `forward` exists for.
 *
 * Two consequences, which were the three-pass design's whole justification:
 *
 *   - No label table sized by the program. A label pool and patch lists
 *     instead: 896 bytes allocated at level 0 against 1,024 for the table,
 *     which is a saving of 128 and not the 970 an earlier comment claimed by
 *     comparing live entries with an allocated table.
 *   - The source is walked once rather than three times.
 */


export const CODE_ORIGIN = 0x0100;
/** Variables sit above any code this language can produce. */
export const DATA_ORIGIN = 0x8000;

/** Deliberate faults, so the resolution check can be shown to fire. */
export type Sabotage =
  | "none"
  /** A forward reference left unresolved, which would ship as a jump to zero. */
  | "drop-patch"
  /** A patch written with the wrong target. */
  | "wrong-target";

export class MicroError extends Error {}

// ------------------------------------------------------------------ tokens

type TokenKind = "name" | "number" | "punct" | "newline" | "end";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly value: number;
  readonly line: number;
}

const PUNCT = ["<>", "=", "+", "(", ")"] as const;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  let line = 1;

  const push = (kind: TokenKind, text: string, value = 0) =>
    tokens.push({ kind, text, value, line });

  while (at < source.length) {
    const ch = source[at];

    if (ch === "\n") {
      // Consecutive newlines collapse into one boundary, as the real
      // tokenizer does and as both canonical grammars depend on.
      if (tokens.length > 0 && tokens[tokens.length - 1].kind !== "newline") {
        push("newline", "\n");
      }
      line += 1;
      at += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      at += 1;
      continue;
    }
    if (ch === "/" && source[at + 1] === "/") {
      while (at < source.length && source[at] !== "\n") at += 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let end = at;
      while (end < source.length && /[A-Za-z0-9]/.test(source[end])) end += 1;
      push("name", source.slice(at, end));
      at = end;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let end = at;
      while (end < source.length && /[0-9]/.test(source[end])) end += 1;
      const text = source.slice(at, end);
      const value = Number(text);
      if (value > 255) throw new MicroError(`line ${line}: ${text} does not fit a byte`);
      push("number", text, value);
      at = end;
      continue;
    }
    const punct = PUNCT.find((p) => source.startsWith(p, at));
    if (punct === undefined) throw new MicroError(`line ${line}: unexpected ${ch}`);
    push("punct", punct);
    at += punct.length;
  }

  if (tokens.length > 0 && tokens[tokens.length - 1].kind !== "newline") {
    push("newline", "\n");
  }
  push("end", "");
  return tokens;
}

// ------------------------------------------------------------------ opcodes
//
// Every encoding here is checked against AZM in `test/spike.test.ts` rather
// than trusted, because asserting encodings from memory has already produced
// two documented errors in this project.

const OP = {
  loadAImmediate: 0x3e, // LD A,n
  loadAFromAddress: 0x3a, // LD A,(nn)
  storeAToAddress: 0x32, // LD (nn),A
  loadBFromA: 0x47, // LD B,A
  addAB: 0x80, // ADD A,B
  addAImmediate: 0xc6, // ADD A,n
  orA: 0xb7, // OR A
  jump: 0xc3, // JP nn
  jumpIfZero: 0xca, // JP Z,nn
  out: 0xd3, // OUT (n),A
  halt: 0x76, // HALT
} as const;

const PORT_CODE = 0x01;

// ------------------------------------------------------------------ compiler

/** A two-byte operand waiting for its target's address. */
interface Patch {
  /** Offset into the emitted bytes where the address goes. */
  readonly at: number;
  readonly label: number;
  readonly line: number;
}

export interface CompileResult {
  readonly bytes: Uint8Array;
  readonly origin: number;
  /** Every variable and where it was placed. */
  readonly variables: ReadonlyMap<string, number>;
  /** Every label's final address. */
  readonly labels: ReadonlyMap<number, number>;
  /** How many patch entries were live at once, which is what the list costs. */
  readonly peakPatches: number;
  /** How many forward references were paid off. */
  readonly patchCount: number;
}

export interface CompileOptions {
  readonly sabotage?: Sabotage;
}

class Compiler {
  #tokens: Token[] = [];
  #at = 0;

  readonly #bytes: number[] = [];
  readonly #variables = new Map<string, number>();
  #nextAddress = DATA_ORIGIN;

  readonly #labels = new Map<number, number>();
  #labelCount = 0;

  #patches: Patch[] = [];
  #peakPatches = 0;
  #patchCount = 0;

  readonly #sabotage: Sabotage;

  constructor(sabotage: Sabotage) {
    this.#sabotage = sabotage;
  }

  // --------------------------------------------------------------- emission

  get #here(): number {
    return CODE_ORIGIN + this.#bytes.length;
  }

  #emit(byte: number): void {
    this.#bytes.push(byte & 0xff);
  }

  #emitWord(value: number): void {
    this.#emit(value & 0xff);
    this.#emit((value >> 8) & 0xff);
  }

  #allocateLabel(): number {
    const id = this.#labelCount;
    this.#labelCount += 1;
    return id;
  }

  /**
   * Fixes a label at the current address and pays off everything waiting for
   * it. This is the only place already-emitted bytes are written to, and it
   * is what back-patching means.
   */
  #placeLabel(id: number): void {
    const address = this.#here;
    this.#labels.set(id, address);

    // A dropped patch stays on the list, which is exactly how the check at
    // the end catches it.
    if (this.#sabotage === "drop-patch") return;

    const waiting = this.#patches.filter((p) => p.label === id);
    this.#patches = this.#patches.filter((p) => p.label !== id);

    for (const patch of waiting) {
      const target = this.#sabotage === "wrong-target" ? address + 1 : address;
      this.#bytes[patch.at] = target & 0xff;
      this.#bytes[patch.at + 1] = (target >> 8) & 0xff;
      this.#patchCount += 1;
    }
  }

  /**
   * A jump to a label. Backward, the address is already known and goes in
   * directly; forward, a placeholder is emitted and its position recorded.
   */
  #emitJump(opcode: number, id: number): void {
    this.#emit(opcode);
    const known = this.#labels.get(id);
    if (known !== undefined) {
      this.#emitWord(known);
      return;
    }
    this.#patches.push({ at: this.#bytes.length, label: id, line: this.#peek().line });
    this.#emitWord(0);
    this.#peakPatches = Math.max(this.#peakPatches, this.#patches.length);
  }

  // ----------------------------------------------------------------- tokens

  #peek(): Token {
    return this.#tokens[this.#at];
  }

  #next(): Token {
    const token = this.#tokens[this.#at];
    if (token.kind !== "end") this.#at += 1;
    return token;
  }

  #expect(kind: TokenKind, text?: string): Token {
    const token = this.#next();
    if (token.kind !== kind || (text !== undefined && token.text !== text)) {
      throw new MicroError(
        `line ${token.line}: expected ${text ?? kind}, found ${token.text || kind}`,
      );
    }
    return token;
  }

  #at_(kind: TokenKind, text: string): boolean {
    const token = this.#peek();
    return token.kind === kind && token.text === text;
  }

  // ------------------------------------------------------------------ parse

  #address(name: string): number {
    const address = this.#variables.get(name);
    // Declaration before use is what makes one walk sufficient: a name is
    // always in the table by the time it is referenced.
    if (address === undefined) throw new MicroError(`${name} is not declared`);
    return address;
  }

  /** `NUMBER | NAME`, leaving the value in A. */
  #term(): void {
    const token = this.#next();
    if (token.kind === "number") {
      this.#emit(OP.loadAImmediate);
      this.#emit(token.value);
      return;
    }
    if (token.kind === "name") {
      this.#emit(OP.loadAFromAddress);
      this.#emitWord(this.#address(token.text));
      return;
    }
    throw new MicroError(`line ${token.line}: expected a term, found ${token.text || token.kind}`);
  }

  /** `term [ "+" term ]`, leaving the value in A. */
  #expression(): void {
    this.#term();
    if (!this.#at_("punct", "+")) return;
    this.#next();

    const right = this.#peek();
    if (right.kind === "number") {
      // A constant addend is two bytes rather than the eight a general
      // right-hand side costs, and it is the common case.
      this.#next();
      this.#emit(OP.addAImmediate);
      this.#emit(right.value);
      return;
    }
    this.#emit(OP.loadBFromA);
    this.#term();
    this.#emit(OP.addAB);
  }

  /** `LD A,(x) / OR A`, which sets Z when the byte is zero. */
  #testVariable(name: string): void {
    this.#emit(OP.loadAFromAddress);
    this.#emitWord(this.#address(name));
    this.#emit(OP.orA);
  }

  #statement(): void {
    if (this.#at_("name", "if")) return this.#ifStatement();
    if (this.#at_("name", "while")) return this.#whileStatement();
    if (this.#at_("name", "writeCodeByte")) return this.#emitStatement();
    return this.#assignment();
  }

  #assignment(): void {
    const name = this.#expect("name").text;
    const address = this.#address(name);
    this.#expect("punct", "=");
    this.#expression();
    this.#emit(OP.storeAToAddress);
    this.#emitWord(address);
    this.#expect("newline");
  }

  #emitStatement(): void {
    this.#expect("name", "writeCodeByte");
    this.#expect("punct", "(");
    const name = this.#expect("name").text;
    this.#expect("punct", ")");
    this.#expect("newline");

    this.#emit(OP.loadAFromAddress);
    this.#emitWord(this.#address(name));
    this.#emit(OP.out);
    this.#emit(PORT_CODE);
  }

  /** `if x <> 0 then … end` — one forward jump, back-patched at `end`. */
  #ifStatement(): void {
    this.#expect("name", "if");
    const name = this.#expect("name").text;
    this.#expect("punct", "<>");
    this.#expect("number");
    this.#expect("name", "then");
    this.#expect("newline");

    const skip = this.#allocateLabel();
    this.#testVariable(name);
    this.#emitJump(OP.jumpIfZero, skip);

    this.#statementList();
    this.#expect("name", "end");
    this.#expect("newline");
    this.#placeLabel(skip);
  }

  /**
   * `while x <> 0 … end` — a forward jump out, back-patched at `end`, and a
   * backward jump home whose target is known already and needs no patch.
   */
  #whileStatement(): void {
    this.#expect("name", "while");
    const name = this.#expect("name").text;
    this.#expect("punct", "<>");
    this.#expect("number");
    this.#expect("newline");

    const top = this.#allocateLabel();
    const out = this.#allocateLabel();

    this.#placeLabel(top);
    this.#testVariable(name);
    this.#emitJump(OP.jumpIfZero, out);

    this.#statementList();
    this.#expect("name", "end");
    this.#expect("newline");

    this.#emitJump(OP.jump, top);
    this.#placeLabel(out);
  }

  #statementList(): void {
    while (true) {
      while (this.#peek().kind === "newline") this.#next();
      const token = this.#peek();
      if (token.kind === "end") return;
      if (token.kind === "name" && token.text === "end") return;
      this.#statement();
    }
  }

  #declaration(): void {
    this.#expect("name", "var");
    const name = this.#expect("name").text;
    this.#expect("name", "as");
    this.#expect("name", "u8");
    this.#expect("newline");

    if (this.#variables.has(name)) throw new MicroError(`${name} is declared twice`);
    this.#variables.set(name, this.#nextAddress);
    this.#nextAddress += 1;
  }

  // ------------------------------------------------------------------- run

  compile(source: string): CompileResult {
    this.#tokens = tokenize(source);
    this.#at = 0;

    while (true) {
      while (this.#peek().kind === "newline") this.#next();
      const token = this.#peek();
      if (token.kind === "end") break;
      if (token.kind === "name" && token.text === "var") {
        this.#declaration();
        continue;
      }
      this.#statement();
    }
    this.#emit(OP.halt);

    // A single-pass compiler has no address agreement to check, because there
    // is no second pass to disagree with. What it has instead is this: every
    // forward reference must have been paid off. One left over would ship as
    // a jump to address zero.
    if (this.#patches.length > 0) {
      const unresolved = this.#patches
        .map((p) => `label ${p.label}, referenced at line ${p.line}`)
        .join("; ");
      throw new MicroError(`unresolved forward references: ${unresolved}`);
    }

    return {
      bytes: Uint8Array.from(this.#bytes),
      origin: CODE_ORIGIN,
      variables: new Map(this.#variables),
      labels: new Map(this.#labels),
      peakPatches: this.#peakPatches,
      patchCount: this.#patchCount,
    };
  }
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  return new Compiler(options.sabotage ?? "none").compile(source);
}
