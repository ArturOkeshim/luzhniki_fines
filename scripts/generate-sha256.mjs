import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const excludedDirectories = new Set([
  "node_modules",
  "dist",
  ".git",
  ".wrangler",
  ".next",
]);
const excludedFiles = new Set(["SHA256SUMS.txt", "tsconfig.tsbuildinfo", ".env.local"]);

function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Символическая ссылка запрещена: ${prefix}${entry.name}`);
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    if (entry.isFile() && excludedFiles.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(absolute, relative));
    if (entry.isFile()) result.push(relative);
  }
  return result;
}

const lines = listFiles(root)
  .sort((left, right) => left.localeCompare(right, "en"))
  .map((relative) => {
    const hash = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(root, ...relative.split("/"))))
      .digest("hex");
    return `${hash}  ${relative}`;
  });

fs.writeFileSync(path.join(root, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ ok: true, files: lines.length, output: "SHA256SUMS.txt" }));
