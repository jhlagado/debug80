; Bounded exact-name table for the first general scalar slice.

.routine out A,carry,zero clobbers sign,parity,halfCarry
SymbolReset:
            XOR  A
            LD   (SymbolCount),A
            LD   (NextLocalSlot),A
            LD   (NextProgramSlot),A
            RET

; Compare the current NAME token with committed entries. Carry returns a
; matching entry in HL. The provisional entry at SymbolCount is invisible.
.routine out A,carry,zero,HL clobbers sign,parity,halfCarry,B,C,D,DE
SymbolFindCurrent:
            LD   A,(SymbolCount)
            OR   A
            RET  Z
            LD   C,A
            LD   HL,SymbolTableBase
SymbolFindCurrentLoop:
            PUSH BC
            PUSH HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   B,(HL)
            EX   DE,HL
            CALL TokenNameEquals
            POP  HL
            POP  BC
            RET  C
            LD   DE,SymbolEntrySize
            ADD  HL,DE
            DEC  C
            JR   NZ,SymbolFindCurrentLoop
            OR   A
            RET

; D is class/type information and E is the storage ordinal. The current name
; is written to the first uncommitted entry but is not yet visible to lookup.
.routine in D,E out A,carry,zero,HL clobbers sign,parity,halfCarry,B,C,D,DE
SymbolPrepareCurrent:
            PUSH DE
            CALL SymbolFindCurrent
            POP  DE
            JR   C,SymbolPrepareDuplicate
            LD   A,(SymbolCount)
            CP   SymbolCapacity
            JR   NC,SymbolPrepareFull
            LD   C,A
            LD   B,0
            LD   H,B
            LD   L,C
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,BC
            LD   BC,SymbolTableBase
            ADD  HL,BC
            LD   BC,(TokenLexemePointer)
            LD   (HL),C
            INC  HL
            LD   (HL),B
            INC  HL
            LD   A,(TokenLength)
            LD   (HL),A
            INC  HL
            LD   (HL),D
            INC  HL
            LD   (HL),E
            OR   A
            RET
SymbolPrepareDuplicate:
            LD   A,DiagnosticDuplicateName
            JP   CompilerSetDiagnostic
SymbolPrepareFull:
            LD   A,DiagnosticSymbolCapacity
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
SymbolCommit:
            LD   HL,SymbolCount
            INC  (HL)
            XOR  A
            RET

; Return the current name's class/type in A and storage ordinal in C.
.routine out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
SymbolLookupCurrent:
            CALL SymbolFindCurrent
            JR   NC,SymbolLookupMissing
            INC  HL
            INC  HL
            INC  HL
            LD   A,(HL)
            INC  HL
            LD   C,(HL)
            OR   A
            RET
SymbolLookupMissing:
            LD   A,DiagnosticUnknownName
            JP   CompilerSetDiagnostic
