import {useRef, useState, useCallback, MutableRefObject} from 'react';

export interface UseHttpStreamParams {
    url: string;
    options?: RequestInit;
    onChunk: (chunk: string) => void; // optional, for raw access
    onDone?: () => void;
    onError?: (err: Error) => void;
}

export interface UseHttpStreamResult {
    start: () => void;
    abort: () => void;
    loading: boolean;
}

export function useHttpStream({
                                  url,
                                  options,
                                  onChunk,
                                  onDone,
                                  onError,
                              }: UseHttpStreamParams): UseHttpStreamResult {
    const controllerRef: MutableRefObject<AbortController | null> = useRef<AbortController | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    const start = useCallback((): void => {
        setLoading(true);
        controllerRef.current = new AbortController();

        fetch(url, {...options, signal: controllerRef.current.signal})
            .then(async (res: Response) => {
                if (!res.body) throw new Error('No response body (streaming not supported)');
                const reader: ReadableStreamDefaultReader<Uint8Array> = res.body.getReader();
                const decoder: TextDecoder = new TextDecoder();
                let done: boolean = false;
                let buffer = "";
                while (!done) {
                    const {value, done: streamDone}: { value?: Uint8Array; done: boolean } = await reader.read();
                    if (value) {
                        const chunk = decoder.decode(value, {stream: !streamDone});
                        buffer += chunk;
                        let lines = buffer.split("\n\n"); // SSE events are separated by double newline
                        console.log("lines", lines)
                        buffer = lines.pop() || "";
                        for (const line of lines) {
                            let cleanLine = line.trim();

                            console.log("cleanLine", cleanLine)
                            if (!cleanLine) continue;
                            if (cleanLine.startsWith("data:")) {
                                cleanLine = cleanLine.slice(5).trim();
                            }
                            console.log("cleanLine", cleanLine)

                            if (!cleanLine) continue;
                            if (onChunk) onChunk(cleanLine);
                        }
                    }
                    done = streamDone;
                }
                onDone && onDone();
            })
            .catch((err: any) => {
                if (err.name !== 'AbortError') onError && onError(err as Error);
            })
            .finally(() => setLoading(false));
    }, [url, options, onChunk, onDone, onError]);

    const abort = useCallback((): void => {
        controllerRef.current?.abort();
        setLoading(false);
    }, []);

    return {start, abort, loading};
}
