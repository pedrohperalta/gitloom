import { describe, expect, it } from "vitest";
import { errorGuidance } from "./gitGuidance";
import { localizeBackendMessage } from "./i18n";
describe("Git guidance", () => {
  it("explains common failures while preserving raw diagnostics", () => {
    for (const [raw, key] of [
      ["fatal: Authentication failed for remote", "authGuidance"],
      ["git@host: Permission denied (publickey).", "authGuidance"],
      ["fatal: Not possible to fast-forward, aborting.", "divergenceGuidance"],
      ["! [rejected] main -> main (non-fast-forward)", "divergenceGuidance"],
      ["error: local changes would be overwritten", "dirtyGuidance"],
      ["fatal: Unable to create index.lock", "lockGuidance"],
      ["Author identity unknown", "identityGuidance"],
    ]) {
      expect(errorGuidance(raw)).toBe(key);
      expect(localizeBackendMessage(raw, "pt-BR")).toBe(raw);
    }
    expect(errorGuidance("unknown hook failure")).toBeNull();
  });
  it("translates hunk failures in both languages", () => {
    expect(localizeBackendMessage("staleHunk", "en")).toContain("file changed");
    expect(localizeBackendMessage("staleHunk", "pt-BR")).toContain(
      "arquivo mudou",
    );
  });
});
