// scripts/bundle-sourcemap-json.js
import fs from "fs";
import path from "path";

const ASSETS = "./dist/assets";
const OUT = "./dist/sourcemaps.json";

const bundle = {};

for (const f of fs.readdirSync(ASSETS)) {
  if (f.endsWith(".map")) {
    bundle[f] = JSON.parse(fs.readFileSync(path.join(ASSETS, f), "utf8"));
  }
}

fs.writeFileSync(OUT, JSON.stringify(bundle));
console.log("✔ sourcemaps.json created");
