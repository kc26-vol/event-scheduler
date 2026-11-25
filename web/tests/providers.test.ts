import assert from "node:assert/strict";
import { test } from "node:test";
import { lineAuthorize, verifyGoogle, verifyLine } from "../lib/providers";

const firebase = {
  FIREBASE_PROJECT_ID: "scheduler-test",
  FIREBASE_API_KEY: "test-key",
};
const line = {
  LINE_CHANNEL_ID: "test-channel",
  LINE_CHANNEL_SECRET: "test-secret",
};

test("provider requests reject redirects without following them with credentials", async (t) => {
  const destinations: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(init.redirect, "manual");
    destinations.push(url);
    return Response.redirect("https://redirect.example.test/", 307);
  });

  await assert.rejects(
    verifyLine(
      line,
      "https://scheduler.test/auth/line-callback",
      "code",
      "nonce",
    ),
    { reason: "line-exchange", providerStatus: 307 },
  );
  await assert.rejects(verifyGoogle(firebase, "test-id-token"), {
    status: 401,
  });
  assert.deepEqual(destinations, [
    "https://api.line.me/oauth2/v2.1/token",
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-key",
  ]);
});

test("Google exchanges a recent project sign-in for the upstream Google ID", async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: "firebase-user",
    aud: firebase.FIREBASE_PROJECT_ID,
    iss: "https://securetoken.google.com/scheduler-test",
    auth_time: now,
    iat: now,
    exp: now + 3600,
    firebase: {
      sign_in_provider: "google.com",
      identities: { "google.com": ["google-user"] },
    },
  };
  // A stand-in for Google's authenticated accounts.lookup endpoint, with a fixed test user.
  const makeToken = (values: object) =>
    "header." +
    Buffer.from(JSON.stringify(values)).toString("base64url") +
    ".signature";
  let accepted = makeToken(claims);
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string, init: RequestInit) => {
      assert.equal(
        input,
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-key",
      );
      if (JSON.parse(String(init.body)).idToken !== accepted)
        return Response.json({}, { status: 400 });
      return Response.json({
        users: [
          {
            localId: "firebase-user",
            providerUserInfo: [
              { providerId: "google.com", rawId: "google-user" },
            ],
          },
        ],
      });
    },
  );
  assert.equal(await verifyGoogle(firebase, accepted), "google-user");
  await assert.rejects(verifyGoogle(firebase, "not-recognized"), {
    status: 401,
  });
  for (const mismatch of [
    { aud: "other-project" },
    { iss: "other-issuer" },
    { auth_time: now - 600 },
    { exp: now - 1 },
    { sub: "other-user" },
    { firebase: { ...claims.firebase, sign_in_provider: "password" } },
    {
      firebase: {
        ...claims.firebase,
        identities: { "google.com": ["another-google-user"] },
      },
    },
  ]) {
    accepted = makeToken({ ...claims, ...mismatch });
    await assert.rejects(verifyGoogle(firebase, accepted), { status: 401 });
  }
});

test("LINE requests OpenID and validates the channel, nonce and provider before returning the subject", async (t) => {
  const redirect = "https://scheduler.test/auth/line-callback";
  const url = new URL(lineAuthorize(line, redirect, "teststate", "testnonce"));
  assert.equal(
    url.origin + url.pathname,
    "https://access.line.me/oauth2/v2.1/authorize",
  );
  assert.equal(url.searchParams.get("redirect_uri"), redirect);
  assert.equal(url.searchParams.get("state"), "teststate");
  assert.equal(url.searchParams.get("nonce"), "testnonce");
  assert.equal(url.searchParams.get("scope"), "openid");
  const claims = {
    sub: "line-user",
    iss: "https://access.line.me",
    aud: "test-channel",
    nonce: "testnonce",
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  let verified = { ...claims };
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string, init: RequestInit) => {
      assert.equal(init.method, "POST");
      const body = init.body as URLSearchParams;
      if (input === "https://api.line.me/oauth2/v2.1/token") {
        assert.equal(body.get("client_secret"), line.LINE_CHANNEL_SECRET);
        assert.equal(body.get("redirect_uri"), redirect);
        return Response.json({ id_token: "issued" });
      }
      assert.equal(input, "https://api.line.me/oauth2/v2.1/verify");
      assert.equal(body.get("id_token"), "issued");
      assert.equal(body.get("nonce"), "testnonce");
      assert.equal(body.get("client_id"), "test-channel");
      return Response.json(verified);
    },
  );
  assert.equal(
    await verifyLine(line, redirect, "code", "testnonce"),
    "line-user",
  );
  for (const [checkName, mismatch] of Object.entries({
    issuer: { iss: "other" },
    audience: { aud: "other" },
    nonce: { nonce: "other" },
    expiry: { exp: 0 },
    subject: { sub: "" },
  })) {
    verified = { ...claims, ...mismatch };
    await assert.rejects(verifyLine(line, redirect, "code", "testnonce"), {
      status: 401,
      reason: "line-verification",
      providerStatus: 200,
      checkName,
    });
  }
});
