; Project-owned BIOS for the Debug80 ideal CP/M 2.2 platform.

        .org    $FA00

CCP_BASE                .equ $E400
BDOS_ENTRY              .equ $EC06
BIOS_BASE               .equ $FA00
WARM_BOOT_SECTORS       .equ 44
SECTORS_PER_TRACK       .equ 26
SECTOR_BYTES            .equ 128

PORT_TERMINAL_TX        .equ $00
PORT_TERMINAL_RX        .equ $01
PORT_TERMINAL_STATUS    .equ $02
PORT_DISK_STATUS        .equ $10
PORT_DISK_DRIVE         .equ $11
PORT_DISK_TRACK_LOW     .equ $12
PORT_DISK_TRACK_HIGH    .equ $13
PORT_DISK_SECTOR        .equ $14
PORT_DISK_DATA          .equ $15

DISK_COMMAND_READ       .equ 1
DISK_COMMAND_WRITE      .equ 2

IOBYTE                  .equ $0003
CURRENT_DISK            .equ $0004
DEFAULT_DMA             .equ $0080

; CP/M 2.2 BIOS jump table. The ordinal and three-byte width are ABI.
        jp      ColdBoot
        jp      WarmBoot
        jp      ConsoleStatus
        jp      ConsoleInput
        jp      ConsoleOutput
        jp      ListOutput
        jp      PunchOutput
        jp      ReaderInput
        jp      Home
        jp      SelectDisk
        jp      SetTrack
        jp      SetSector
        jp      SetDma
        jp      ReadSector
        jp      WriteSector
        jp      ListStatus
        jp      SectorTranslate

ColdBoot:
        di
        ld      sp,BootStackTop
        xor     a
        ld      (IOBYTE),a
        ld      (CURRENT_DISK),a
        ld      c,a
        call    InstallPageZero
        jp      CCP_BASE

WarmBoot:
        di
        ld      sp,BootStackTop
        xor     a
        ld      (BootTrack),a
        out     (PORT_DISK_DRIVE),a
        ld      a,1
        ld      (BootSector),a
        ld      a,WARM_BOOT_SECTORS
        ld      (BootSectorsRemaining),a
        ld      hl,CCP_BASE

WarmBootRead:
        ld      a,(BootTrack)
        out     (PORT_DISK_TRACK_LOW),a
        xor     a
        out     (PORT_DISK_TRACK_HIGH),a
        ld      a,(BootSector)
        out     (PORT_DISK_SECTOR),a
        ld      a,DISK_COMMAND_READ
        out     (PORT_DISK_STATUS),a
        in      a,(PORT_DISK_STATUS)
        or      a
        jr      nz,BootDiskError
        ld      b,SECTOR_BYTES
        ld      c,PORT_DISK_DATA
        inir
        in      a,(PORT_DISK_STATUS)
        or      a
        jr      nz,BootDiskError

        ld      a,(BootSector)
        inc     a
        cp      SECTORS_PER_TRACK+1
        jr      c,WarmBootStoreSector
        ld      a,1
        ld      (BootSector),a
        ld      a,(BootTrack)
        inc     a
        ld      (BootTrack),a
        jr      WarmBootSectorAdvanced

WarmBootStoreSector:
        ld      (BootSector),a

WarmBootSectorAdvanced:
        ld      a,(BootSectorsRemaining)
        dec     a
        ld      (BootSectorsRemaining),a
        jr      nz,WarmBootRead
        ld      a,(CURRENT_DISK)
        ld      c,a
        call    InstallPageZero
        jp      CCP_BASE

BootDiskError:
        ld      hl,BootErrorMessage
        call    PrintZeroTerminated
        halt
        jr      BootDiskError

InstallPageZero:
        ld      a,$C3
        ld      ($0000),a
        ld      hl,WarmBoot
        ld      ($0001),hl
        ld      ($0005),a
        ld      hl,BDOS_ENTRY
        ld      ($0006),hl
        ret

ConsoleStatus:
        in      a,(PORT_TERMINAL_STATUS)
        and     1
        ret     z
        ld      a,$FF
        ret

ConsoleInput:
        call    ConsoleStatus
        or      a
        jr      z,ConsoleInput
        in      a,(PORT_TERMINAL_RX)
        and     $7F
        ret

ConsoleOutput:
        ld      a,c
        out     (PORT_TERMINAL_TX),a
        ret

ListOutput:
PunchOutput:
        ret

ReaderInput:
        ld      a,$1A
        ret

Home:
        ld      bc,0

SetTrack:
        ld      (CurrentTrack),bc
        ret

SelectDisk:
        ld      a,c
        or      a
        ld      hl,0
        ret     nz
        ld      hl,DiskParameterHeader
        ret

SetSector:
        ld      (CurrentSector),bc
        ret

SetDma:
        ld      (CurrentDma),bc
        ret

ReadSector:
        call    SelectCurrentSector
        ret     nz
        ld      hl,(CurrentDma)
        ld      b,SECTOR_BYTES
        ld      c,PORT_DISK_DATA
        inir
        in      a,(PORT_DISK_STATUS)
        or      a
        ret     z
        ld      a,1
        ret

WriteSector:
        call    SelectCurrentAddress
        ret     nz
        ld      a,DISK_COMMAND_WRITE
        out     (PORT_DISK_STATUS),a
        in      a,(PORT_DISK_STATUS)
        or      a
        jr      nz,DiskError
        ld      hl,(CurrentDma)
        ld      b,SECTOR_BYTES
        ld      c,PORT_DISK_DATA
        otir
        in      a,(PORT_DISK_STATUS)
        or      a
        ret     z

DiskError:
        ld      a,1
        ret

SelectCurrentSector:
        call    SelectCurrentAddress
        ret     nz
        ld      a,DISK_COMMAND_READ
        out     (PORT_DISK_STATUS),a
        in      a,(PORT_DISK_STATUS)
        or      a
        jr      nz,DiskError
        ret

SelectCurrentAddress:
        xor     a
        out     (PORT_DISK_DRIVE),a
        ld      a,(CurrentTrack)
        out     (PORT_DISK_TRACK_LOW),a
        ld      a,(CurrentTrack+1)
        out     (PORT_DISK_TRACK_HIGH),a
        ld      a,(CurrentSector)
        out     (PORT_DISK_SECTOR),a
        xor     a
        ret

ListStatus:
        xor     a
        ret

SectorTranslate:
        ld      h,b
        ld      l,c
        inc     hl
        ret

PrintZeroTerminated:
        ld      a,(hl)
        or      a
        ret     z
        out     (PORT_TERMINAL_TX),a
        inc     hl
        jr      PrintZeroTerminated

BootErrorMessage:
        .db     "CP/M BOOT ERROR",13,10,0

BootTrack:
        .db     0
BootSector:
        .db     1
BootSectorsRemaining:
        .db     0

CurrentTrack:
        .dw     0
CurrentSector:
        .dw     1
CurrentDma:
        .dw     DEFAULT_DMA

DiskParameterHeader:
        .dw     0
        .dw     0,0,0
        .dw     DirectoryBuffer
        .dw     DiskParameterBlock
        .dw     ChecksumVector
        .dw     AllocationVector

DiskParameterBlock:
        .dw     26
        .db     3
        .db     7
        .db     0
        .dw     242
        .dw     63
        .db     $C0,$00
        .dw     16
        .dw     2

DirectoryBuffer:
        .ds     128
ChecksumVector:
        .ds     16
AllocationVector:
        .ds     31

        .ds     32
BootStackTop:

        .binto  $FDFF
