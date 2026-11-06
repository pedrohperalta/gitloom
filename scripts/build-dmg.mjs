import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
const app = join(
  root,
  "src-tauri/target/release/bundle/macos",
  `${config.productName}.app`,
);
// Tauri's linker signature says resources are sealed, but the bundle has none.
// Gatekeeper then reports the downloaded app as damaged. Ad-hoc sign the bundle
// before packaging. This is not a Developer ID signature or notarization.
run("codesign", ["--force", "--sign", "-", app]);
run("codesign", ["--verify", "--deep", "--strict", app]);
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
  removeFinderInfo(output, `${config.productName}.app`);
  console.log(`Installer created: ${output}`);
} finally {
  rmSync(temporary, { force: true });
}

function removeFinderInfo(dmg, appName) {
  const work = mkdtempSync(join(tmpdir(), "gitloom-dmg-"));
  const writable = join(work, "rw.dmg");
  const mount = join(work, "mnt");
  const compressed = join(work, "fixed.dmg");
  mkdirSync(mount);
  try {
    run("hdiutil", ["convert", dmg, "-format", "UDRW", "-o", writable]);
    run("hdiutil", [
      "attach",
      "-nobrowse",
      "-readwrite",
      "-mountpoint",
      mount,
      writable,
    ]);
    try {
      run("xattr", ["-d", "com.apple.FinderInfo", join(mount, appName)]);
      run("codesign", ["--verify", "--deep", "--strict", join(mount, appName)]);
    } finally {
      run("hdiutil", ["detach", mount]);
    }
    run("hdiutil", ["convert", writable, "-format", "UDZO", "-o", compressed]);
    rmSync(dmg);
    renameSync(compressed, dmg);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
