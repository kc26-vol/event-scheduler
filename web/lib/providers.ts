import { check, HttpError } from "./db";

interface GoogleSettings {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_API_KEY?: string;
}
interface LineSettings {
  LINE_CHANNEL_ID?: string;
  LINE_CHANNEL_SECRET?: string;
}

const denied = "認証を確認できませんでした。もう一度ログインしてください。";

async function providerResponse<T>(
  url: string,
  request: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...request,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(503, "認証サービスに接続できませんでした。");
  }
  if (!response.ok && (response.status >= 500 || response.status === 429))
    throw new HttpError(503, "認証サービスを一時的に利用できません。");
  check(response.ok, denied, 401);
  return (await response.json()) as T;
}

interface FirebaseClaims {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  firebase?: {
    sign_in_provider?: string;
    tenant?: string;
    identities?: Record<string, string[]>;
  };
}

interface FirebaseAccount {
  localId: string;
  disabled?: boolean;
  providerUserInfo?: { providerId: string; rawId: string }[];
}

export async function verifyGoogle(
  env: GoogleSettings,
  token: string,
): Promise<string> {
  check(
    env.FIREBASE_PROJECT_ID && env.FIREBASE_API_KEY,
    "Google ログインの設定が必要です。",
    503,
  );
  check(
    typeof token === "string" && token.length > 0 && token.length <= 16384,
    denied,
    401,
  );

  // Firebase authenticates this exact token before any of its claims are trusted.
  const { users } = await providerResponse<{ users?: FirebaseAccount[] }>(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
      encodeURIComponent(env.FIREBASE_API_KEY),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );
  let claims: FirebaseClaims;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw Error();
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new HttpError(401, denied);
  }
  const account = users?.[0];
  const now = Math.floor(Date.now() / 1000);
  check(
    claims &&
      account &&
      !account.disabled &&
      account.localId &&
      account.localId === claims.sub &&
      claims.aud === env.FIREBASE_PROJECT_ID &&
      claims.iss ===
        "https://securetoken.google.com/" + env.FIREBASE_PROJECT_ID &&
      typeof claims.exp === "number" &&
      claims.exp > now &&
      typeof claims.iat === "number" &&
      claims.iat <= now + 30 &&
      typeof claims.auth_time === "number" &&
      claims.auth_time >= now - 300 &&
      claims.auth_time <= now + 30 &&
      claims.firebase?.sign_in_provider === "google.com" &&
      !claims.firebase.tenant,
    denied,
    401,
  );
  const subject = account.providerUserInfo?.find(
    (p) => p.providerId === "google.com",
  )?.rawId;
  check(
    subject && claims.firebase.identities?.["google.com"]?.includes(subject),
    denied,
    401,
  );
  return subject;
}

export function lineAuthorize(
  env: LineSettings,
  redirectUri: string,
  state: string,
  nonce: string,
): string {
  check(
    env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET,
    "LINE ログインの設定が必要です。",
    503,
  );
  check(state && nonce, "ログインをやり直してください。");
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.LINE_CHANNEL_ID,
    redirect_uri: redirectUri,
    state,
    scope: "openid",
    nonce,
  }).toString();
  return url.href;
}

export async function verifyLine(
  env: LineSettings,
  redirectUri: string,
  code: string,
  nonce: string,
): Promise<string> {
  check(
    env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET,
    "LINE ログインの設定が必要です。",
    503,
  );
  check(code && nonce, denied, 401);
  const { id_token } = await providerResponse<{ id_token?: string }>(
    "https://api.line.me/oauth2/v2.1/token",
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env.LINE_CHANNEL_ID,
        client_secret: env.LINE_CHANNEL_SECRET,
      }),
    },
  );
  check(id_token, denied, 401);
  const claims = await providerResponse<{
    sub?: string;
    nonce?: string;
    aud?: string;
    iss?: string;
    exp?: number;
  }>("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    body: new URLSearchParams({
      id_token,
      client_id: env.LINE_CHANNEL_ID,
      nonce,
    }),
  });
  check(
    typeof claims.sub === "string" &&
      claims.sub &&
      claims.iss === "https://access.line.me" &&
      claims.nonce === nonce &&
      claims.aud === env.LINE_CHANNEL_ID &&
      typeof claims.exp === "number" &&
      claims.exp > Date.now() / 1000,
    denied,
    401,
  );
  return claims.sub;
}
