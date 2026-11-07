import { build } from "esbuild";
await build({
  entryPoints: ["desktop/main.ts"],
  outfile: "build/main.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["desktop/preload.ts"],
  outfile: "build/preload.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["desktop/server.ts"],
  outfile: "build/server.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
});
