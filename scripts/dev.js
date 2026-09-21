import { watch } from "node:fs";
import { build, root } from "./build.js";

let files;
let sourceHash;
async function rebuild() {
  // Editors and filesystem watchers can send several events for the same save.
  const hash = new Bun.CryptoHasher("sha256");
  const sources = await Array.fromAsync(
    new Bun.Glob("**/*").scan({ cwd: `${root}src`, onlyFiles: true }),
  );
  for (const path of sources.sort()) {
    hash.update(path);
    hash.update(await Bun.file(`${root}src/${path}`).arrayBuffer());
  }
  const nextHash = hash.digest("hex");
  if (nextHash === sourceHash) {
    return;
  }
  await build();
  sourceHash = nextHash;
  files = new Set(
    await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: `${root}dist`, onlyFiles: true })),
  );
}
await rebuild();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 4173),
  fetch(request) {
    const path = new URL(request.url).pathname.slice(1) || "index.html";
    if (!files.has(path)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(Bun.file(`${root}dist/${path}`), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'",
      },
    });
  },
});
console.log(`Preview: ${server.url}`);
let timer;
let pending = Promise.resolve();
const watcher = watch(`${root}src`, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = pending.then(rebuild).catch(console.error);
  }, 100);
});
function stop() {
  clearTimeout(timer);
  watcher.close();
  server.stop(true);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
