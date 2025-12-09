; Core constants for the sample machine layout and services

ROMSTART    EQU $0000          ; system/ROM area 0x0000–0x07FF
APPSTART    EQU $0900          ; user program entry point
STACK_TOP   EQU $FF00          ; convenient stack top in RAM

; Service selector values (passed in C) for RST 10H
SVC_PUTCHAR EQU $10            ; A = char
SVC_GETCHAR EQU $11            ; returns A = char
SVC_PUTSTR  EQU $12            ; HL = 0-terminated string
SVC_CLEAR   EQU $13            ; clear screen

; ASCII helpers
CR          EQU $0D
LF          EQU $0A
ESC         EQU $1B
