/** A lost response is ambiguous. Keep the media unless an authoritative read proves it unused. */
export async function commitAvatar(
  id: string,
  update: () => Promise<void>,
  read: () => Promise<string | null>,
  discard: () => Promise<void>,
): Promise<boolean> {
  try {
    await update();
  } catch (error) {
    let current: string | null;
    try {
      current = await read();
    } catch {
      return false;
    } // Preserve a possibly accepted avatar until the next preference refresh.
    if (current === id) return true;
    await discard().catch(() => undefined);
    throw error;
  }
  return true;
}
