// scripts/upload-sourcemap.js
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DIST = "./dist";
const VERSION_FILE = path.join(DIST, "build-version.txt");
const MANIFEST_PATH = path.join(DIST, ".vite/manifest.json");

// 读取 commit hash
if (!fs.existsSync(VERSION_FILE)) {
  console.error("❌ build-version.txt not found.");
  process.exit(1);
}
const version = fs.readFileSync(VERSION_FILE, "utf8").trim();
console.log("✔ Version:", version);

// 上传 manifest.json
execSync(
  `pnpx wrangler r2 object put citizenshub-sourcemaps/${version}/manifest.json --file=${MANIFEST_PATH} --remote`,
  { stdio: "inherit" }
);

// 上传 sourcemaps
execSync(
  `pnpx wrangler r2 object put citizenshub-sourcemaps/${version}/sourcemaps.json --file=${path.join(DIST, "sourcemaps.json")} --remote`,
  { stdio: "inherit" }
);

console.log("🎉 All sourcemaps uploaded for version", version);
