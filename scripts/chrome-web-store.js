import { createPrivateKey, sign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STORE_SCOPE = "https://www.googleapis.com/auth/chromewebstore";

function serviceAccountAssertion(value) {
  let account;

  try {
    account = JSON.parse(value);
  } catch {
    throw new Error("CWS_SERVICE_ACCOUNT_JSON must contain valid JSON");
  }

  if (
    account?.type !== "service_account" ||
    typeof account.client_email !== "string" ||
    !account.client_email.trim() ||
    typeof account.private_key !== "string"
  ) {
    throw new Error(
      "CWS_SERVICE_ACCOUNT_JSON must contain a service account email and private key",
    );
  }

  let privateKey;

  try {
    privateKey = createPrivateKey(account.private_key);

    if (privateKey.asymmetricKeyType !== "rsa") {
      throw new Error("Expected an RSA key");
    }
  } catch {
    throw new Error("CWS_SERVICE_ACCOUNT_JSON must contain a valid RSA private key");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: STORE_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const message = [header, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  const signature = sign("RSA-SHA256", Buffer.from(message), privateKey).toString("base64url");

  return `${message}.${signature}`;
}

// Official API v2. Upload-only unless publication is explicitly selected.
export async function uploadToStore({ archive, env, request = fetch, wait = Bun.sleep }) {
  for (const key of ["CWS_SERVICE_ACCOUNT_JSON", "CWS_PUBLISHER_ID", "CWS_EXTENSION_ID"]) {
    if (!env[key]) {
      throw new Error(`Missing ${key}; see docs/releasing.md`);
    }
  }

  async function json(url, options) {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(60000) });

    if (!response.ok) {
      // Do not echo OAuth bodies, bearer tokens, or credentials into CI logs.
      throw new Error(`Chrome Web Store request failed: HTTP ${response.status}`);
    }

    return response.json();
  }

  const token = await json(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountAssertion(env.CWS_SERVICE_ACCOUNT_JSON),
    }),
  });

  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("OAuth response did not include an access token");
  }

  const headers = { Authorization: `Bearer ${token.access_token}` };
  const item = `publishers/${encodeURIComponent(env.CWS_PUBLISHER_ID)}/items/${encodeURIComponent(env.CWS_EXTENSION_ID)}`;
  const api = `https://chromewebstore.googleapis.com/v2/${item}`;

  const upload = await json(`https://chromewebstore.googleapis.com/upload/v2/${item}:upload`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/zip" },
    body: archive,
  });

  let state = upload.uploadState;

  for (
    let attempt = 0;
    ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(state) && attempt < 20;
    attempt++
  ) {
    await wait(3000);

    const status = await json(`${api}:fetchStatus`, { headers });
    state = status.lastAsyncUploadState;
  }

  if (state !== "SUCCEEDED") {
    throw new Error(
      `Upload did not succeed (${state || "unknown"}); check the Developer Dashboard`,
    );
  }

  if (env.CWS_PUBLISH === "true") {
    await json(`${api}:publish`, { method: "POST", headers });

    console.log(
      "Submitted for review. Check the Developer Dashboard for review and publication status.",
    );
  } else {
    console.log("Uploaded successfully. Not submitted for review.");
  }
}

if (import.meta.main) {
  const { version } = await Bun.file("dist/manifest.json").json();
  const archive = Bun.file(`release/helium-new-tab-${version}.zip`);

  if (!(await archive.exists())) {
    throw new Error("Run bun run package before uploading");
  }

  await uploadToStore({ archive, env: process.env });
}
