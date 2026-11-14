// onnxruntime-web ships types its package "exports" do not expose; this covers what Sol's voice uses.
declare module 'onnxruntime-web' {
  export class Tensor {
    constructor(type: 'int64' | 'float32', data: BigInt64Array | Float32Array, dims: readonly number[]);
    readonly data: Float32Array | BigInt64Array;
  }
  export interface InferenceSessionHandle {
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }
  export const InferenceSession: {
    create(model: Uint8Array, options?: { executionProviders?: string[] }): Promise<InferenceSessionHandle>;
  };
}
