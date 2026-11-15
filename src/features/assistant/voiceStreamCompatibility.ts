// Phonemizer reads its gzipped dictionary with for-await-of at import time.
// Older WebKit supports Compression Streams and getReader() but lacks async
// iteration. This runs before phonemizer and only changes the voice worker.
if (typeof ReadableStream !== 'undefined' && !(Symbol.asyncIterator in ReadableStream.prototype)) {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    async *value<T>(this: ReadableStream<T>) {
      const reader = this.getReader();
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) return;
          yield chunk.value;
        }
      } finally {
        try {
          await reader.cancel();
        } finally {
          reader.releaseLock();
        }
      }
    },
  });
}
