import { describe, expect, it } from "vitest";
import { layoutGraph, parseDiff } from "./graph";
import type { Commit } from "./types";
const c = (hash: string, parents: string[]): Commit => ({
  hash,
  parents,
  author: "",
  date: "",
  subject: "",
  refs: "",
});
describe("commit graph", () => {
  it("connects merge parents and converges without dangling lanes", () => {
    const graph = layoutGraph([
      c("merge", ["main", "feature"]),
      c("feature", ["base"]),
      c("main", ["base"]),
      c("base", []),
    ]);
    expect(graph.columns).toBe(2);
    expect(
      graph.rows[0].edges.filter((e) => e.start === "node").map((e) => e.to),
    ).toEqual([0, 1]);
    expect(graph.rows[2].edges.find((e) => e.start === "node")?.to).toBe(0);
    expect(
      graph.rows.flatMap((r) => r.edges).every((e) => e.from >= 0 && e.to >= 0),
    ).toBe(true);
    expect(graph.rows[3].edges.every((e) => e.end === "node")).toBe(true);
  });
  it("starts disconnected roots without inventing parent edges", () => {
    const graph = layoutGraph([c("one", []), c("two", [])]);
    expect(graph.rows.map((r) => r.edges.length)).toEqual([0, 0]);
  });
});
describe("diff line numbers", () => {
  it("separates headers, tracks both sides, and resets for subsequent hunks", () => {
    const lines = parseDiff(
      "--- a/a\n+++ b/a\n@@ -2,2 +2,2 @@\n same\n-old\n+new\n@@ -20 +25 @@\n-x\n+y",
    );
    expect(lines[1].kind).toBe("meta");
    expect(lines[3]).toMatchObject({ old: 2, next: 2 });
    expect(lines[4]).toMatchObject({ old: 3, next: null });
    expect(lines[5]).toMatchObject({ old: null, next: 3 });
    expect(lines[7].old).toBe(20);
    expect(lines[8].next).toBe(25);
  });
});
