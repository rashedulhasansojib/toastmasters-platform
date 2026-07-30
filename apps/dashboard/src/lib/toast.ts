import { toast } from 'sonner';

export { toast };

export type ActionMessages = {
  loading: string;
  success: string;
  error: string;
};

/**
 * Runs `action` while showing a loading → success/error toast.
 *
 * If `action` returns a `Response`, a non-2xx status is treated as failure and
 * the error toast fires. When the error body is JSON with a `message` field,
 * that server message is preferred over the caller's generic `error` text.
 *
 * Returns the resolved value on success, or `undefined` on failure — so callers
 * can gate follow-up work (form reset, router.refresh, dialog close) without a
 * try/catch of their own.
 */
export async function submitAction<T>(
  action: () => Promise<T>,
  messages: ActionMessages,
): Promise<Awaited<T> | undefined> {
  const promise = (async () => {
    const result = await action();
    if (result instanceof Response && !result.ok) {
      throw new Error((await readErrorMessage(result)) ?? messages.error);
    }
    return result;
  })();
  toast.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: (err) => {
      // TypeError is what fetch throws for network/CORS failures; its message
      // ("Failed to fetch" / "NetworkError when attempting to fetch resource.")
      // is a browser artefact, not something to show a user.
      if (err instanceof TypeError) return messages.error;
      if (err instanceof Error && err.message) return err.message;
      return messages.error;
    },
  });
  try {
    return await promise;
  } catch {
    return undefined;
  }
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as unknown;
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      // problem+json uses `detail`; NestJS default uses `message`.
      const detail = typeof obj.detail === 'string' ? obj.detail : undefined;
      const message = typeof obj.message === 'string' ? obj.message : undefined;
      const picked =
        detail && detail.length > 0 ? detail : message && message.length > 0 ? message : undefined;
      if (picked) return picked;
    }
  } catch {
    // body wasn't JSON, or was already consumed
  }
  return undefined;
}
