// scripts/clean-sourcemaps.js
import fs from "fs";
import path from "path";

const ASSETS_DIR = "./dist/assets";

for (const file of fs.readdirSync(ASSETS_DIR)) {
  if (file.endsWith(".map")) {
    fs.unlinkSync(path.join(ASSETS_DIR, file));
    console.log("🗑 deleted:", file);
  }
}

fs.unlinkSync(path.join("./dist", "sourcemaps.json"));

console.log("✔ All sourcemap files removed.");
