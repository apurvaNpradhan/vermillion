/** The integer typed arrays `getRandomValues` fills, as in the Web Crypto API. */
type IntegerArray =
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array;

export type RandomSource = {
  getRandomValues<T extends IntegerArray>(array: T): T;
  randomUUID(): string;
};

/**
 * Hermes has no global `crypto`, which UUIDv7 id generation needs. Adds one backed by `source`
 * unless the runtime already has its own.
 */
export function installCrypto(
  runtime: { crypto?: Pick<Crypto, "getRandomValues" | "randomUUID"> },
  source: RandomSource,
): void {
  if (runtime.crypto) return;
  Object.defineProperty(runtime, "crypto", {
    value: {
      getRandomValues: <T extends IntegerArray>(array: T) => source.getRandomValues(array),
      randomUUID: () => source.randomUUID(),
    },
    configurable: true,
    writable: true,
  });
}
