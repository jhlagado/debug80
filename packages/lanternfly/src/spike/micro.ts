/**
 * The three-pass spike.
 *
 * `docs/three-pass-spike.md` sets the goal: compile a deliberately throwaway
 * micro-language to Z80, run the image, and prove the layout pass and the
 * emission pass agree on every address. It is not the seed, it is not the
 * nucleus, and it takes no position on either language's design.
 *
 * The architecture under test is the one every planning document asserts and
 * none has executed:
 *
 *   analysis  — reads declarations, assigns storage, counts nothing else
 *   layout    — runs the lowerer against a counting sink and records where
 *               every label landed
 *   emission  — runs *the same lowerer* to a byte stream and checks each
 *               address against what layout recorded
 *
 * A forward jump's target is unknown when the jump is emitted and the output
 * cannot be seeked, which is why there are three passes rather than two. This
 * is the first test of that claim.
 */

export const CODE_ORIGIN = 0x0100;
/** Variables sit above any code this language can produce. */
export const DATA_ORIGIN = 0x8000;

export type Pass = "analysis" | "layout" | "emission";

/** Deliberate faults, so the address check can be shown to fire. */
export type Sabotage = "none" | "extra-byte" | "short-jump" | "moved-label";

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

export interface CompileResult {
  readonly bytes: Uint8Array;
  readonly origin: number;
  /** Every variable and where it was placed. */
  readonly variables: ReadonlyMap<string, number>;
  /** Label addresses, as the layout pass recorded them. */
  readonly labels: readonly number[];
  /** Total length each pass produced, which must agree. */
  readonly layoutLength: number;
}

export interface CompileOptions {
  readonly sabotage?: Sabotage;
}

class Compiler {
  #tokens: Token[] = [];
  #at = 0;

  #pass: Pass = "analysis";
  #here = CODE_ORIGIN;
  #bytes: number[] = [];

  #labels: number[] = [];
  #labelCount = 0;

  readonly #variables = new Map<string, number>();
  #nextAddress = DATA_ORIGIN;

  #layoutLength = 0;
  readonly #sabotage: Sabotage;

  constructor(sabotage: Sabotage) {
    this.#sabotage = sabotage;
  }

  // --------------------------------------------------------------- emission

  #emit(byte: number): void {
    this.#here += 1;
    if (this.#pass === "emission") this.#bytes.push(byte & 0xff);
  }

  #emitWord(value: number): void {
    this.#emit(value & 0xff);
    this.#emit((value >> 8) & 0xff);
  }

  /**
   * Allocates a label. Identifiers are handed out in the same order by every
   * pass, which is what lets the emission pass read addresses the layout pass
   * wrote.
   */
  #allocateLabel(): number {
    const id = this.#labelCount;
    this.#labelCount += 1;
    return id;
  }

  /**
   * Records where a label landed, or checks it.
   *
   * The check is the whole point of the third pass. It fires when a lowering
   * emits a different number of bytes in emission than it did in layout,
   * which is the failure the architecture exists to make impossible.
   */
  #placeLabel(id: number): void {
    if (this.#pass === "layout") {
      this.#labels[id] = this.#here;
      return;
    }
    if (this.#pass === "emission") {
      const expected = this.#labels[id];
      if (this.#sabotage === "moved-label" && id === 0) {
        this.#labels[id] = expected + 1;
      }
      if (this.#labels[id] !== this.#here) {
        throw new MicroError(
          `label ${id}: layout said ${this.#labels[id]}, emission reached ${this.#here}`,
        );
      }
    }
  }

  /** A forward jump reads an address the layout pass already filled in. */
  #emitJump(opcode: number, id: number): void {
    this.#emit(opcode);
    this.#emitWord(this.#labels[id] ?? 0);
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

  /** `if x <> 0 then … end` — one forward jump over the body. */
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

  /** `while x <> 0 … end` — a forward jump out and a backward jump home. */
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
    if (this.#pass === "emission" && this.#sabotage === "short-jump") {
      // Undo one byte of the jump, so emission is shorter than layout.
      this.#bytes.pop();
      this.#here -= 1;
    }
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

    if (this.#pass !== "analysis") return;
    if (this.#variables.has(name)) throw new MicroError(`${name} is declared twice`);
    this.#variables.set(name, this.#nextAddress);
    this.#nextAddress += 1;
  }

  #program(): void {
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
    if (this.#pass === "emission" && this.#sabotage === "extra-byte") {
      this.#emit(0x00);
    }
  }

  // ------------------------------------------------------------------- run

  #runPass(pass: Pass, tokens: Token[]): void {
    this.#pass = pass;
    this.#at = 0;
    this.#tokens = tokens;
    this.#here = CODE_ORIGIN;
    this.#labelCount = 0;
    if (pass === "emission") this.#bytes = [];
    this.#program();
  }

  compile(source: string): CompileResult {
    const tokens = tokenize(source);

    // Analysis assigns storage. It walks the same grammar so that a name used
    // before its declaration is an error in the pass that can say so.
    this.#runPass("analysis", tokens);

    this.#runPass("layout", tokens);
    this.#layoutLength = this.#here - CODE_ORIGIN;

    this.#runPass("emission", tokens);
    const emitted = this.#here - CODE_ORIGIN;

    if (emitted !== this.#layoutLength) {
      throw new MicroError(
        `layout produced ${this.#layoutLength} bytes and emission produced ${emitted}`,
      );
    }
    if (this.#bytes.length !== emitted) {
      throw new MicroError(
        `emission counted ${emitted} bytes and wrote ${this.#bytes.length}`,
      );
    }

    return {
      bytes: Uint8Array.from(this.#bytes),
      origin: CODE_ORIGIN,
      variables: new Map(this.#variables),
      labels: [...this.#labels],
      layoutLength: this.#layoutLength,
    };
  }
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  return new Compiler(options.sabotage ?? "none").compile(source);
}
