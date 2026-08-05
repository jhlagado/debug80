import { describe, expect, it } from "vitest";
import { assembleSource } from "../src/bootstrap/index.js";

const claimed: Array<[string, string, number[]]> = [
  ["opLoadHlFromAddress", "LD HL,($1234)", [42]],
  ["opStoreHlToAddress", "LD ($1234),HL", [34]],
  ["opLoadAFromAddress", "LD A,($1234)", [58]],
  ["opStoreAToAddress", "LD ($1234),A", [50]],
  ["opLoadHlImmediate", "LD HL,$1234", [33]],
  ["opLoadDeImmediate", "LD DE,$1234", [17]],
  ["opAddHlDe", "ADD HL,DE", [25]],
  ["opExDeHl", "EX DE,HL", [235]],
  ["opOrA", "OR A", [183]],
  ["opSbcHlDe", "SBC HL,DE", [237, 82]],
  ["opPushHl", "PUSH HL", [229]],
  ["opPopDe", "POP DE", [209]],
  ["opAddHlHl", "ADD HL,HL", [41]],
  ["opLoadAFromHl", "LD A,(HL)", [126]],
  ["opLoadEFromHl", "LD E,(HL)", [94]],
  ["opLoadDFromHl", "LD D,(HL)", [86]],
  ["opIncHl", "INC HL", [35]],
  ["opStoreEToHl", "LD (HL),E", [115]],
  ["opStoreDToHl", "LD (HL),D", [114]],
  ["opStoreAToDe", "LD (DE),A", [18]],
  ["opLoadAFromL", "LD A,L", [125]],
  ["opLoadLFromA", "LD L,A", [111]],
  ["opOrE", "OR E", [179]],
  ["opAndE", "AND E", [163]],
  ["opXorImmediate", "XOR $01", [238]],
  ["opLoadHImmediate", "LD H,$00", [38]],
  ["opCall", "CALL $1234", [205]],
  ["opJump", "JP $1234", [195]],
  ["opJumpIfZero", "JP Z,$1234", [202]],
  ["opJumpIfNotZero", "JP NZ,$1234", [194]],
  ["opReturn", "RET", [201]],
  ["opOrH", "OR H", [180]],
];

describe("every opcode constant against the assembler", () => {
  for (const [name, mnemonic, expected] of claimed) {
    it(`${name} is ${mnemonic}`, () => {
      const { bytes } = assembleSource(`.org $0000\nStart:\n    ${mnemonic}\n`);
      expect(Array.from(bytes.slice(0, expected.length))).toEqual(expected);
    });
  }
});
