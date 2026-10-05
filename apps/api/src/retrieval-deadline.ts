export class RetrievalDeadlineError extends Error {
  constructor() {
    super('RETRIEVAL_WORK_TIMEOUT');
    this.name = 'RetrievalDeadlineError';
  }
}

export async function retrievalCancellation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return operation();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}

/** Hard report deadline; an uncooperative operation may still finish its own cleanup later. */
export async function retrievalDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<T> {
  external?.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const callerAbort = () => controller.abort(external?.reason);
  external?.addEventListener('abort', callerAbort, { once: true });
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => controller.abort(new RetrievalDeadlineError()), timeoutMs);
      if (external?.aborted) callerAbort();
    });
    // Promise.race keeps rejection handlers attached to work that settles after cancellation.
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      }),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', callerAbort);
    if (cancel) controller.signal.removeEventListener('abort', cancel);
    if (!controller.signal.aborted) controller.abort();
  }
}
