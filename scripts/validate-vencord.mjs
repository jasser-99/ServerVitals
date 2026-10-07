import { cp, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(".validation/Vencord");
try {
  await access(path.join(root, "node_modules/typescript/bin/tsc"));
} catch {
  throw new Error(
    "Clone Vencord into .validation/Vencord and run pnpm install --frozen-lockfile there first. See docs/TESTING.md.",
  );
}
await cp(
  "dist/vencord/serverVitals",
  path.join(root, "src/userplugins/serverVitals"),
  { recursive: true },
);
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  [
    "--require=./scripts/suppressExperimentalWarnings.js",
    "scripts/build/build.mjs",
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=6144" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.info(
  "Vencord source typecheck and desktop build passed. This does not verify live Discord module discovery.",
);
