import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("dist/betterdiscord", { recursive: true });
await build({
  entryPoints: ["packages/betterdiscord/index.ts"],
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  minify: false,
  legalComments: "inline",
  outfile: "dist/betterdiscord/ServerVitals.plugin.js",
  banner: {
    js: `/**\n * @name ServerVitals\n * @author ServerVitals contributors\n * @version ${version}\n * @description Find the servers that have gone quiet. Independent alpha. Initial implementation 100% AI generated.\n * @license GPL-3.0-or-later\n */`,
  },
});
const root = "dist/vencord/serverVitals";
await mkdir(root, { recursive: true });
for (const name of ["core", "discord", "ui"])
  await cp(`packages/${name}/src`, `${root}/shared/${name}/src`, {
    recursive: true,
  });
const entry = (await readFile("packages/vencord/index.tsx", "utf8"))
  .replaceAll('"../discord/', '"./shared/discord/')
  .replaceAll('"../ui/', '"./shared/ui/');
await writeFile(`${root}/index.tsx`, entry);
await cp("LICENSE", `${root}/LICENSE`);
await cp("docs/INSTALL-VENCORD.md", `${root}/README.md`);
await build({
  stdin: { contents: entry, resolveDir: root, loader: "tsx" },
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  external: ["@api/*", "@utils/*", "@webpack", "@webpack/*", "react"],
  target: "es2022",
});
const files = {};
async function collect(directory, prefix) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isDirectory())
      await collect(`${directory}/${item.name}`, `${prefix}/${item.name}`);
    else
      files[`${prefix}/${item.name}`] = new Uint8Array(
        await readFile(`${directory}/${item.name}`),
      );
  }
}
await collect(root, "serverVitals");
await writeFile("dist/ServerVitals-Vencord.zip", zipSync(files, { level: 6 }));
const assets = [
  "betterdiscord/ServerVitals.plugin.js",
  "ServerVitals-Vencord.zip",
];
await writeFile(
  "dist/SHA256SUMS.txt",
  (
    await Promise.all(
      assets.map(
        async (name) =>
          `${createHash("sha256")
            .update(await readFile(`dist/${name}`))
            .digest("hex")}  ${name}`,
      ),
    )
  ).join("\n") + "\n",
);
console.info(
  `ServerVitals ${version}: BetterDiscord bundle and Vencord userplugin source built. Full Vencord build: npm run validate:vencord.`,
);
