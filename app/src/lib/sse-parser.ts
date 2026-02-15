/**
 * Async generator that parses an SSE (text/event-stream) ReadableStream
 * into structured { event, data } messages per the SSE specification.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by double newlines
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawMessage = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let event = 'message';
        let data = '';

        for (const line of rawMessage.split('\n')) {
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            data += (data ? '\n' : '') + line.slice(5).trim();
          }
          // Ignore comment lines (starting with ':') and other fields
        }

        // Only yield if we have a non-empty event block
        if (event || data) {
          yield { event, data };
        }

        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
