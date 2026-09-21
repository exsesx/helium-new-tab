import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const { version } = await Bun.file("dist/manifest.json").json();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Expected a three-part release version in the manifest");
}

const metadata = await Bun.file("package.json").json();

if (metadata.version !== version) {
  throw new Error("package.json and manifest versions must match");
}

if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${version}`) {
  throw new Error("Release tag must match the manifest version");
}

const archive = resolve(`release/helium-new-tab-${version}.zip`);
await mkdir("release", { recursive: true });
await rm(archive, { force: true });

const files = (
  await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: "dist", onlyFiles: true }))
).sort();

const zip = Bun.spawn(["zip", "-X", "-q", archive, ...files], {
  cwd: "dist",
  stdout: "inherit",
  stderr: "inherit",
});

if ((await zip.exited) !== 0) {
  throw new Error("Packaging failed; install the zip command and retry");
}

const sha256 = new Bun.CryptoHasher("sha256")
  .update(await Bun.file(archive).arrayBuffer())
  .digest("hex");

await Bun.write(`${archive}.sha256`, `${sha256}  helium-new-tab-${version}.zip\n`);
console.log(`Packaged ${archive}`);
