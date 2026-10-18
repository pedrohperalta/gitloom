import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with exit code ${result.status ?? 1}`);
}
if (process.platform !== "darwin") {
  console.error("The DMG installer must be built on macOS.");
  process.exit(1);
}
// Build the app with Tauri, then write Finder metadata without AppleScript.
run(process.execPath, ["scripts/tauri.mjs", "build", "--bundles", "app"]);
const environment = join(root, ".toolchain", "dmgbuild");
const python = join(environment, "bin", "python3");
if (!existsSync(python)) run("python3", ["-m", "venv", environment]);
run(python, [
  "-m",
  "pip",
  "install",
  "--disable-pip-version-check",
  "-r",
  "scripts/dmg-requirements.txt",
]);
const config = JSON.parse(
  readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"),
);
const outputDir = join(root, "src-tauri/target/release/bundle/dmg");
mkdirSync(outputDir, { recursive: true });
const arch = process.arch === "arm64" ? "aarch64" : process.arch;
const output = join(
  outputDir,
  `${config.productName}_${config.version}_${arch}.dmg`,
);
const temporary = join(outputDir, `.Gitloom-${process.pid}.dmg`);
try {
  run(join(environment, "bin", "dmgbuild"), [
    "-s",
    "scripts/dmg-settings.py",
    config.productName,
    temporary,
  ]);
  renameSync(temporary, output);
  console.log(`Installer created: ${output}`);
} finally {
  rmSync(temporary, { force: true });
}
