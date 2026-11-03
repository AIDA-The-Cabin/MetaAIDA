// nodejs_compat's Buffer — only what the API uses (this Workers project has no @types/node).
declare module 'node:buffer' {
  interface WorkerBuffer extends Uint8Array {
    toString(encoding: 'base64'): string;
  }
  export const Buffer: {
    from(data: ArrayBufferLike, byteOffset?: number, length?: number): WorkerBuffer;
    from(data: string, encoding: 'base64'): WorkerBuffer;
  };
}
