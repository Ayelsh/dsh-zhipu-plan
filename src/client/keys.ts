/**
 * Idempotency keys for the reset calls, minted per click.
 *
 * The host requires the key to be unique per intended operation and at most 64
 * characters. `crypto.randomUUID` exists only in secure contexts, and the
 * packaged application serves its page from a custom scheme, so the key is
 * built from `crypto.getRandomValues`, which every context provides.
 *
 * @module dsh-zhipu-plan/client/keys
 */

const HEX = '0123456789abcdef'

/**
 * Mint one idempotency key.
 * @returns 32 hexadecimal characters from the platform CSPRNG.
 */
export function randomKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let text = ''
  for (const byte of bytes) text += HEX[byte >> 4]! + HEX[byte & 0x0f]!
  return text
}
