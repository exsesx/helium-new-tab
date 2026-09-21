// Official API v2. Upload-only unless publication is explicitly selected.
export async function uploadToStore({ archive, env, request = fetch, wait = Bun.sleep }) {
  for (const key of [
    "CWS_CLIENT_ID",
    "CWS_CLIENT_SECRET",
    "CWS_REFRESH_TOKEN",
    "CWS_PUBLISHER_ID",
    "CWS_EXTENSION_ID",
  ]) {
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

  const token = await json("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!token.access_token) {
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
