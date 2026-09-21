import { expect, test } from "bun:test";
import { uploadToStore } from "../scripts/chrome-web-store.js";

const env = {
  CWS_CLIENT_ID: "test-client",
  CWS_CLIENT_SECRET: "test-secret",
  CWS_REFRESH_TOKEN: "test-refresh",
  CWS_PUBLISHER_ID: "test-publisher",
  CWS_EXTENSION_ID: "test-item",
};

function fixture(responses) {
  const calls = [];

  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, method: options.method || "GET" });

      const response = responses.shift();

      if (!response) {
        throw new Error("Unexpected extra API call");
      }

      return Response.json(response.body || response, { status: response.status || 200 });
    },
  };
}

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
  const mock = fixture([]);

  await expect(
    uploadToStore({ archive: new Blob(), env: {}, request: mock.request }),
  ).rejects.toThrow("Missing CWS_CLIENT_ID");

  expect(mock.calls).toHaveLength(0);
});
