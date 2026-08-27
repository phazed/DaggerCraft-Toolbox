import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const outputDir = path.join(projectDir, "dist");

const rootEntries = await readdir(projectDir, { withFileTypes: true });
const frontendFiles = rootEntries
  .filter((entry) => {
    if (!entry.isFile()) return false;
    return (
      entry.name === "index.html" ||
      entry.name === "app.js" ||
      entry.name === "main.js" ||
      entry.name === "desktop-bootstrap.js" ||
      entry.name === "desktop-storage.js" ||
      entry.name === "cloud-save.js" ||
      entry.name === "cloud-ui.js" ||
      entry.name === "supabase-client.js" ||
      entry.name.startsWith("tool-")
    );
  })
  .map((entry) => entry.name);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await Promise.all(
  frontendFiles.map((filename) =>
    cp(path.join(projectDir, filename), path.join(outputDir, filename))
  )
);

await cp(path.join(projectDir, "data"), path.join(outputDir, "data"), {
  recursive: true
});

console.log(`Prepared ${frontendFiles.length} frontend files in ${outputDir}`);
