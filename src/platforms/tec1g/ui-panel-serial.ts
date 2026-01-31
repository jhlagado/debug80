/**
 * @file TEC-1G panel serial buffer helpers.
 */

export type SerialBuffer = {
  text: string;
  maxChars: number;
};

/**
 * Creates a serial buffer with default limits.
 */
export function createSerialBuffer(maxChars = 8000): SerialBuffer {
  return { text: '', maxChars };
}

/**
 * Appends serial text while enforcing the buffer limit.
 */
export function appendSerialText(buffer: SerialBuffer, text: string): void {
  buffer.text += text;
  if (buffer.text.length > buffer.maxChars) {
    buffer.text = buffer.text.slice(buffer.text.length - buffer.maxChars);
  }
}

/**
 * Clears the serial buffer.
 */
export function clearSerialBuffer(buffer: SerialBuffer): void {
  buffer.text = '';
}
