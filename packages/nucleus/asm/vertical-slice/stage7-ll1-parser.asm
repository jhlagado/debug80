; Packed LL(1) parser section owner. The interpreter core and generated grammar
; tables are separate source parts so dependency includes remain in the header
; while the emitted order stays core, tables, end marker.

            .include "stage7-ll1-parser-core.asmi"
            .include "../../grammar/stage7-tables.asmi"
            .include "stage7-ll1-parser-table-end.asmi"
