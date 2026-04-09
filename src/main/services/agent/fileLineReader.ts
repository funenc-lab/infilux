import { createReadStream } from 'node:fs';
import type { Interface } from 'node:readline';
import readline from 'node:readline';

interface FileLineReader {
  stream: ReturnType<typeof createReadStream>;
  lineReader: Interface;
}

export function createFileLineReader(filePath: string): FileLineReader {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lineReader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  return {
    stream,
    lineReader,
  };
}

export async function closeFileLineReader({ lineReader, stream }: FileLineReader): Promise<void> {
  lineReader.close();

  if (stream.closed || stream.destroyed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const finalize = (): void => {
      stream.off('close', finalize);
      stream.off('error', finalize);
      resolve();
    };

    stream.once('close', finalize);
    stream.once('error', finalize);
    stream.destroy();
  });
}
