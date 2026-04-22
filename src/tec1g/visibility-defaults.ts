/**
 * Default TEC-1G platform panel section visibility; shared by extension and webview bundle.
 */
export const TEC1G_DEFAULT_PANEL_VISIBILITY: Readonly<Record<string, boolean>> = {
  lcd: true,
  display: true,
  keypad: true,
  matrixKeyboard: false,
  matrix: false,
  glcd: true,
  serial: false,
};
