; RAM layout for the Pacmo scrolling experiment.
RamStart:
PlayerX:
        .db      0
PlayerY:
        .db      0
Monsters:
Monster0:
        .ds      MonsterSize
Monster1:
        .ds      MonsterSize
Monster2:
        .ds      MonsterSize
EnemyX .equ Monster0 + MonsterX
EnemyY .equ Monster0 + MonsterY
EnemyDir .equ Monster0 + MonsterDir
EnemyTimer .equ Monster0 + MonsterTimer
EnemyRespTimer .equ Monster0 + MonRespTimer
EnemyState .equ Monster0 + MonsterState
Enemy2X .equ Monster1 + MonsterX
Enemy2Y .equ Monster1 + MonsterY
Enemy2Dir .equ Monster1 + MonsterDir
Enemy2Timer .equ Monster1 + MonsterTimer
Enemy2RespTimer .equ Monster1 + MonRespTimer
Enemy2State .equ Monster1 + MonsterState
Enemy3X .equ Monster2 + MonsterX
Enemy3Y .equ Monster2 + MonsterY
Enemy3Dir .equ Monster2 + MonsterDir
Enemy3Timer .equ Monster2 + MonsterTimer
Enemy3RespTimer .equ Monster2 + MonRespTimer
Enemy3State .equ Monster2 + MonsterState
EnemyPeriodCur:
        .db      0
ViewX:
        .db      0
ViewY:
        .db      0
MoveCooldown:
        .db      0
LastKey:
        .db      0
PacSplashActive:
        .db      0
PacPaused:
        .db      0
HudScanIndex:
        .db      0
SpeakerPort:
        .db      0
SoundTimer:
        .db      0
SndDivReload:
        .db      0
SndDivCount:
        .db      0
PacScore:
        .dw      0
HudSegBuffer:
        .ds      6
FramePhase:
        .db      0
RenderEatenPtr:
        .dw      0
PacPwrPillsEat:
        .db      0
PacPowerTimer:
        .dw      0
PacPowerTimerLo .equ PacPowerTimer
PacPowerTimerHi .equ PacPowerTimer + 1
PacRoundDone:
        .db      0
PacPlayerCaught:
        .db      0
PacGameOver:
        .db      0
PacLevel:
        .db      0
PacLives:
        .db      0
PacLvlDoneGate:
        .dw      0
PacLvlDoneLo .equ PacLvlDoneGate
PacLvlDoneHi .equ PacLvlDoneGate + 1
PacGOverGate:
        .dw      0
PacGOverGateLo .equ PacGOverGate
PacGOverGateHi .equ PacGOverGate + 1
ScanMask:
        .db      0
ScanPtr:
        .dw      0
Framebuffer:
        .ds      FramebufferBytes
FramebufferBack:
        .ds      FramebufferBytes
PacEatenRows:
        .ds      PacEatenBytes
RamEnd:
