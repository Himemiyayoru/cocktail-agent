// Expo substitutes this public URL at build time. Never put credentials here.
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://bobs-special-blend.onrender.com').replace(/\/$/, '');

export async function apiRequest<T>(path: string, options: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', cancel);
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    let data: any;
    try { data = await response.json(); }
    catch {
      if (controller.signal.aborted) throw new Error('Request aborted');
      throw new Error('The service returned an unreadable response. Please try again.');
    }
    if (!response.ok || data?.status === 'error') {
      const detail = typeof data?.detail === 'string' ? data.detail : undefined;
      throw new Error(response.status === 429 ? 'Too many requests. Please try again later.'
        : response.status === 404 ? 'This item is no longer available.'
        : detail || 'The service could not complete this request. Please try again.');
    }
    return data as T;
  } catch (error) {
    if (timedOut) throw new Error('The service is taking too long. Please try again.');
    if (controller.signal.aborted) {
      const aborted = new Error('Request cancelled');
      aborted.name = 'AbortError';
      throw aborted;
    }
    if (error instanceof TypeError) throw new Error('Unable to connect. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
