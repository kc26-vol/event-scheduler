// Account actions must surface expired invitations and invalid provider credentials on the current page.
export async function accountRequest<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch("/auth/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    throw Error(
      typeof payload?.detail === "string"
        ? payload.detail
        : "処理できませんでした。もう一度お試しください。",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
