/**
 * id.ts — opaque unique-id generation (T0.4).
 *
 * Cards/sections use string IDs (`ID` in types.ts). We prefer the platform
 * `crypto.randomUUID()` (available in all modern browsers + Node ≥ 19); a tiny
 * RFC-4122-v4 fallback keeps pure-logic tests working in any environment.
 */

/** Generate a new unique id (UUID v4). */
export function newId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  // Fallback: build a v4 UUID from random bytes.
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Per RFC 4122 §4.4: set version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) hex.push(bytes[i]!.toString(16).padStart(2, '0'));
  return (
    `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-` +
    `${hex[4]}${hex[5]}-` +
    `${hex[6]}${hex[7]}-` +
    `${hex[8]}${hex[9]}-` +
    `${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
  );
}
