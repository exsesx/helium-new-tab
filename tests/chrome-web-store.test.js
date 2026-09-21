import { expect, test } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { uploadToStore } from "../scripts/chrome-web-store.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  type: "service_account",
  client_email: "test-publisher@test-project.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
};
const env = {
  CWS_SERVICE_ACCOUNT_JSON: JSON.stringify(account),
  CWS_PUBLISHER_ID: "test-publisher",
  CWS_EXTENSION_ID: "test-item",
};

function fixture(responses) {
  const calls = [];

  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, ...options, method: options.method || "GET" });

      const response = responses.shift();

      if (!response) {
        throw new Error("Unexpected extra API call");
      }

      return Response.json(response.body || response, { status: response.status || 200 });
    },
  };
}

test("service account signs a scoped JWT and uses the exchanged access token", async () => {
  const mock = fixture([{ access_token: "test-token" }, { uploadState: "SUCCEEDED" }]);
  const startedAt = Math.floor(Date.now() / 1000);

  await uploadToStore({ archive: new Blob(["test"]), env, request: mock.request });

  const tokenRequest = mock.calls[0];
  expect(tokenRequest.url).toBe("https://oauth2.googleapis.com/token");
  expect(tokenRequest.method).toBe("POST");
  expect(tokenRequest.body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

  const [header, payload, signature] = tokenRequest.body.get("assertion").split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());

  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
    alg: "RS256",
    typ: "JWT",
  });
  expect(claims.iss).toBe(account.client_email);
  expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
  expect(claims.scope).toBe("https://www.googleapis.com/auth/chromewebstore");
  expect(claims.iat).toBeGreaterThanOrEqual(startedAt);
  expect(claims.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  expect(claims.exp - claims.iat).toBe(3600);
  expect(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, "base64url"),
    ),
  ).toBe(true);
  expect(mock.calls[1].headers.Authorization).toBe("Bearer test-token");
});

test("store upload defaults to upload-only", async () => {
  const mock = fixture([{ access_token: "test-token" }, { uploadState: "SUCCEEDED" }]);

  await uploadToStore({ archive: new Blob(["test"]), env, request: mock.request });

  expect(mock.calls.map((call) => call.url.split(":").at(-1))).toEqual([
    "//oauth2.googleapis.com/token",
    "upload",
  ]);
});

test("publication waits for asynchronous upload success", async () => {
  for (const state of ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"]) {
    const mock = fixture([
      { access_token: "test-token" },
      { uploadState: state },
      { lastAsyncUploadState: "SUCCEEDED" },
      { state: "PENDING_REVIEW" },
    ]);

    await uploadToStore({
      archive: new Blob(["test"]),
      env: { ...env, CWS_PUBLISH: "true" },
      request: mock.request,
      wait: async () => {},
    });

    expect(mock.calls.slice(1).map((call) => [call.url.split(":").at(-1), call.method])).toEqual([
      ["upload", "POST"],
      ["fetchStatus", "GET"],
      ["publish", "POST"],
    ]);
  }
});

test("failed uploads never publish and errors never expose response bodies", async () => {
  for (const response of [
    { uploadState: "FAILED" },
    { status: 401, body: { secret: "private-response" } },
  ]) {
    const mock = fixture([{ access_token: "test-token" }, response]);

    try {
      await uploadToStore({
        archive: new Blob(["test"]),
        env: { ...env, CWS_PUBLISH: "true" },
        request: mock.request,
      });

      throw new Error("Expected rejection");
    } catch (error) {
      expect(error.message).not.toBe("Expected rejection");
      expect(error.message).not.toContain("private-response");
    }

    expect(mock.calls).toHaveLength(2);
  }
});

test("missing store credentials fail before making requests", async () => {
  for (const key of ["CWS_SERVICE_ACCOUNT_JSON", "CWS_PUBLISHER_ID", "CWS_EXTENSION_ID"]) {
    const mock = fixture([]);

    await expect(
      uploadToStore({ archive: new Blob(), env: { ...env, [key]: "" }, request: mock.request }),
    ).rejects.toThrow(`Missing ${key}`);

    expect(mock.calls).toHaveLength(0);
  }
});

test("invalid service account credentials fail without exposing their contents", async () => {
  for (const value of [
    "private-credential-content",
    "null",
    JSON.stringify({ ...account, type: "authorized_user" }),
    JSON.stringify({ ...account, client_email: "" }),
    JSON.stringify({ ...account, private_key: "private-credential-content" }),
  ]) {
    const mock = fixture([]);

    try {
      await uploadToStore({
        archive: new Blob(),
        env: { ...env, CWS_SERVICE_ACCOUNT_JSON: value },
        request: mock.request,
      });

      throw new Error("Expected rejection");
    } catch (error) {
      expect(error.message).toContain("CWS_SERVICE_ACCOUNT_JSON must contain");
      expect(error.message).not.toContain("private-credential-content");
      expect(error.message).not.toContain(account.private_key);
    }

    expect(mock.calls).toHaveLength(0);
  }
});

test("authentication failures stop before uploading or publishing", async () => {
  for (const response of [
    { status: 401, body: { error: "private-response" } },
    { body: { token_type: "Bearer" } },
  ]) {
    const mock = fixture([response]);

    try {
      await uploadToStore({
        archive: new Blob(),
        env: { ...env, CWS_PUBLISH: "true" },
        request: mock.request,
      });

      throw new Error("Expected rejection");
    } catch (error) {
      expect(error.message).not.toBe("Expected rejection");
      expect(error.message).not.toContain("private-response");
    }

    expect(mock.calls).toHaveLength(1);
  }
});
