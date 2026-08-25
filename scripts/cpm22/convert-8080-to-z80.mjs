import fs from "node:fs";

const [inputPath, outputPath, originText, dialect = "azm"] =
  process.argv.slice(2);
if (!inputPath || !outputPath || !originText) {
  throw new Error("usage: node cpm22-convert.mjs input.asm output.asm origin");
}

const knownSymbols = new Map([
  ["origin", true],
  ["noserial", false],
  ["patch1", true],
  ["test", false],
  ["testing", false],
]);

function splitComment(line) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote !== "") {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ";") {
      return [line.slice(0, index), line.slice(index)];
    }
  }
  return [line, ""];
}

function transformOutsideStrings(text, transform) {
  let result = "";
  let segment = "";
  let quote = "";
  for (const character of text) {
    if (quote !== "") {
      result += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      result += transform(segment);
      segment = "";
      quote = character;
      result += character;
    } else {
      segment += character;
    }
  }
  return result + transform(segment);
}

function expression(text) {
  return transformOutsideStrings(text, (segment) =>
    segment
      .replace(/\b([01]+)[bB]\b/g, (_match, digits) => `%${digits}`)
      .replace(/\b_true\b/g, "CpmTrue")
      .replace(/\b_false\b/g, "CpmFalse"),
  );
}

function symbolName(text) {
  if (text === "_true") return "CpmTrue";
  if (text === "_false") return "CpmFalse";
  return text;
}

function immediate(text) {
  const value = text.trim();
  if (value.startsWith("(") && value.endsWith(")")) {
    return value.slice(1, -1);
  }
  return value;
}

function operands(text) {
  const result = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (const character of text) {
    if (quote !== "") {
      current += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
    } else if (character === "(") {
      depth += 1;
      current += character;
    } else if (character === ")") {
      depth -= 1;
      current += character;
    } else if (character === "," && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim() !== "" || text.includes(",")) result.push(current.trim());
  return result;
}

function reg8(value) {
  return value.trim().toLowerCase() === "m"
    ? "(hl)"
    : value.trim().toLowerCase();
}

function pair(value) {
  const mapped = { b: "bc", d: "de", h: "hl", psw: "af", sp: "sp" }[
    value.trim().toLowerCase()
  ];
  if (!mapped) throw new Error(`unknown register pair ${value}`);
  return mapped;
}

function requireOperands(mnemonic, values, count, lineNumber) {
  if (values.length !== count) {
    throw new Error(
      `${lineNumber}: ${mnemonic} expected ${count} operands, got ${values.length}`,
    );
  }
}

function instruction(mnemonicRaw, operandText, lineNumber) {
  const mnemonic = mnemonicRaw.toLowerCase();
  const values = operands(expression(operandText));
  const oneReg = () => {
    requireOperands(mnemonic, values, 1, lineNumber);
    return reg8(values[0]);
  };
  const onePair = () => {
    requireOperands(mnemonic, values, 1, lineNumber);
    return pair(values[0]);
  };
  const oneExpr = () => {
    requireOperands(mnemonic, values, 1, lineNumber);
    return values[0];
  };

  switch (mnemonic) {
    case "mov":
      requireOperands(mnemonic, values, 2, lineNumber);
      return `ld ${reg8(values[0])},${reg8(values[1])}`;
    case "mvi":
      requireOperands(mnemonic, values, 2, lineNumber);
      return `ld ${reg8(values[0])},${immediate(values[1])}`;
    case "lxi":
      requireOperands(mnemonic, values, 2, lineNumber);
      return `ld ${pair(values[0])},${immediate(values[1])}`;
    case "lda":
      return `ld a,(${oneExpr()})`;
    case "sta":
      return `ld (${oneExpr()}),a`;
    case "lhld":
      return `ld hl,(${oneExpr()})`;
    case "shld":
      return `ld (${oneExpr()}),hl`;
    case "ldax":
      return `ld a,(${onePair()})`;
    case "stax":
      return `ld (${onePair()}),a`;
    case "inx":
      return `inc ${onePair()}`;
    case "dcx":
      return `dec ${onePair()}`;
    case "inr":
      return `inc ${oneReg()}`;
    case "dcr":
      return `dec ${oneReg()}`;
    case "dad":
      return `add hl,${onePair()}`;
    case "add":
      return `add a,${oneReg()}`;
    case "adc":
      return `adc a,${oneReg()}`;
    case "sub":
      return `sub ${oneReg()}`;
    case "sbb":
      return `sbc a,${oneReg()}`;
    case "ana":
      return `and ${oneReg()}`;
    case "ora":
      return `or ${oneReg()}`;
    case "xra":
      return `xor ${oneReg()}`;
    case "cmp":
      return `cp ${oneReg()}`;
    case "adi":
      return `add a,${oneExpr()}`;
    case "sui":
      return `sub ${oneExpr()}`;
    case "sbi":
      return `sbc a,${oneExpr()}`;
    case "ani":
      return `and ${oneExpr()}`;
    case "ori":
      return `or ${oneExpr()}`;
    case "cpi":
      return `cp ${oneExpr()}`;
    case "push":
      return `push ${onePair()}`;
    case "pop":
      return `pop ${onePair()}`;
    case "jmp":
      return `jp ${oneExpr()}`;
    case "jc":
      return `jp c,${oneExpr()}`;
    case "jnc":
      return `jp nc,${oneExpr()}`;
    case "jnz":
      return `jp nz,${oneExpr()}`;
    case "jz":
      return `jp z,${oneExpr()}`;
    case "jp":
      return `jp p,${oneExpr()}`;
    case "call":
      return `call ${oneExpr()}`;
    case "cnc":
      return `call nc,${oneExpr()}`;
    case "cnz":
      return `call nz,${oneExpr()}`;
    case "cz":
      return `call z,${oneExpr()}`;
    case "rc":
      return "ret c";
    case "rnc":
      return "ret nc";
    case "rnz":
      return "ret nz";
    case "rz":
      return "ret z";
    case "ret":
      return "ret";
    case "pchl":
      return "jp (hl)";
    case "sphl":
      return "ld sp,hl";
    case "xchg":
      return "ex de,hl";
    case "cma":
      return "cpl";
    case "ral":
      return "rla";
    case "rar":
      return "rra";
    case "rlc":
      return "rlca";
    case "rrc":
      return "rrca";
    case "nop":
      return "nop";
    default:
      throw new Error(`${lineNumber}: unsupported mnemonic ${mnemonic}`);
  }
}

function conditionValue(kind, symbol) {
  const key = symbol.trim().toLowerCase();
  if (kind === "ifdef") return knownSymbols.get(key) === true;
  if (kind === "ifndef") return knownSymbols.get(key) !== true;
  if (!knownSymbols.has(key))
    throw new Error(`unknown conditional symbol ${symbol}`);
  return knownSymbols.get(key) === true;
}

const input = fs
  .readFileSync(inputPath, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n");
const output = [];
const conditionalStack = [];
let active = true;

for (let index = 0; index < input.length; index += 1) {
  const original = input[index];
  const lineNumber = index + 1;
  const [code, comment] = splitComment(original);
  const trimmed = code.trim();
  const conditional = /^(ifdef|ifndef|if)\s+(.+)$/i.exec(trimmed);
  if (conditional) {
    const parentActive = active;
    const branch = conditionValue(conditional[1].toLowerCase(), conditional[2]);
    conditionalStack.push({ parentActive, branch, elseSeen: false });
    active = parentActive && branch;
    output.push(`; converted ${trimmed}${comment ? ` ${comment}` : ""}`);
    continue;
  }
  if (/^else$/i.test(trimmed)) {
    const frame = conditionalStack.at(-1);
    if (!frame || frame.elseSeen)
      throw new Error(`${lineNumber}: invalid else`);
    frame.elseSeen = true;
    active = frame.parentActive && !frame.branch;
    output.push("; converted else");
    continue;
  }
  if (/^endif$/i.test(trimmed)) {
    const frame = conditionalStack.pop();
    if (!frame) throw new Error(`${lineNumber}: invalid endif`);
    active = frame.parentActive;
    output.push("; converted endif");
    continue;
  }
  if (!active) {
    output.push(`; inactive ${original}`);
    continue;
  }
  if (/^\.cpu\s+8080$/i.test(trimmed)) {
    output.push(`origin          .equ ${originText}`);
    continue;
  }
  if (/^title\b/i.test(trimmed) || /^end(?:\s|$)/i.test(trimmed)) {
    output.push(`; converted ${original.trim()}`);
    continue;
  }
  if (trimmed === "" || trimmed.startsWith(";")) {
    output.push(original);
    continue;
  }

  const labelOnly = /^(\s*)([A-Za-z_][A-Za-z0-9_]*):\s*$/.exec(code);
  if (labelOnly) {
    output.push(`${labelOnly[1]}${labelOnly[2]}:${comment}`);
    continue;
  }

  const declaration =
    /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s+(equ|set)\s+(.+?)\s*$/i.exec(code);
  if (declaration) {
    output.push(
      `${declaration[1]}${symbolName(declaration[2])} .equ ${expression(declaration[4])}${comment}`,
    );
    continue;
  }

  const statement =
    /^(\s*)(?:([A-Za-z_][A-Za-z0-9_]*):\s*)?([A-Za-z.][A-Za-z0-9_.]*)(?:\s+(.*?))?\s*$/i.exec(
      code,
    );
  if (!statement) throw new Error(`${lineNumber}: cannot parse ${original}`);
  const [, indent, label, headRaw, body = ""] = statement;
  const head = headRaw.toLowerCase();
  const prefix = `${indent}${label ? `${label}: ` : ""}`;
  if (["org", "db", "dw", "ds"].includes(head)) {
    output.push(`${prefix}.${head} ${expression(body)}${comment}`);
    continue;
  }
  output.push(`${prefix}${instruction(head, body, lineNumber)}${comment}`);
}

if (conditionalStack.length !== 0) throw new Error("unterminated conditional");
const rendered =
  dialect === "sjasm"
    ? output.map((line) =>
        line
          .replace(/^(\s*[A-Za-z_][A-Za-z0-9_]*) \.equ /, "$1 EQU ")
          .replace(
            /^(\s*(?:[A-Za-z_][A-Za-z0-9_]*:\s*)?)\.(org|db|dw|ds)\b/i,
            "$1$2",
          ),
      )
    : output;
fs.writeFileSync(outputPath, rendered.join("\n"));
