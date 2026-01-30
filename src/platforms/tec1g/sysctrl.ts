export type Tec1gSysCtrlState = {
  shadowEnabled: boolean;
  protectEnabled: boolean;
  expandEnabled: boolean;
};

export const decodeSysCtrl = (value: number): Tec1gSysCtrlState => {
  const masked = value & 0xff;
  return {
    shadowEnabled: (masked & 0x01) === 0,
    protectEnabled: (masked & 0x02) !== 0,
    expandEnabled: (masked & 0x04) !== 0,
  };
};
