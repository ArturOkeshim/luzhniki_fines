import path from "node:path";

// vinext 0.0.50 builds its production static-file cache from path.relative().
// On Windows that produces backslashes, while browser URL paths always use
// forward slashes. Normalize only relative paths before vinext is imported.
if (process.platform === "win32") {
  const originalRelative = path.relative.bind(path);

  path.relative = (...args) => originalRelative(...args).replaceAll("\\", "/");
}
