import type { Commit } from "./types";
export const colors = Array.from(
  { length: 6 },
  (_, i) => `var(--graph-${i + 1})`,
);
export type Edge = {
  from: number;
  to: number;
  color: string;
  start: "top" | "node";
  end: "bottom" | "node";
};
export type GraphRow = { column: number; color: string; edges: Edge[] };
export function layoutGraph(commits: Commit[]): {
  rows: GraphRow[];
  columns: number;
} {
  let lanes: string[] = [];
  const tint = new Map<string, string>();
  const rows: GraphRow[] = [];
  let columns = 1,
    nextColor = 0;
  const color = (hash: string) => {
    if (!tint.has(hash)) tint.set(hash, colors[nextColor++ % colors.length]);
    return tint.get(hash)!;
  };
  for (const commit of commits) {
    const before = [...lanes];
    let column = lanes.indexOf(commit.hash);
    if (column < 0) {
      column = lanes.length;
      lanes.push(commit.hash);
    }
    const nodeColor = color(commit.hash);
    const after = lanes.filter((hash) => hash !== commit.hash);
    commit.parents.forEach((parent, i) => {
      if (!after.includes(parent)) {
        after.splice(Math.min(column + i, after.length), 0, parent);
        if (i === 0 && !tint.has(parent)) tint.set(parent, nodeColor);
        color(parent);
      }
    });
    const edges: Edge[] = [];
    before.forEach((hash, from) => {
      if (hash === commit.hash)
        edges.push({
          from,
          to: column,
          color: nodeColor,
          start: "top",
          end: "node",
        });
      else
        edges.push({
          from,
          to: after.indexOf(hash),
          color: color(hash),
          start: "top",
          end: "bottom",
        });
    });
    commit.parents.forEach((parent) =>
      edges.push({
        from: column,
        to: after.indexOf(parent),
        color: color(parent),
        start: "node",
        end: "bottom",
      }),
    );
    columns = Math.max(columns, lanes.length, after.length);
    rows.push({ column, color: nodeColor, edges });
    lanes = after;
  }
  return { rows, columns };
}
export type DiffLine = {
  text: string;
  kind: "add" | "remove" | "hunk" | "meta" | "context";
  old: number | null;
  next: number | null;
};
export function parseDiff(diff: string): DiffLine[] {
  let old = 0,
    next = 0,
    inHunk = false;
  return diff.split("\n").map((text) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (match) {
      old = Number(match[1]);
      next = Number(match[2]);
      inHunk = true;
      return { text, kind: "hunk", old: null, next: null };
    }
    if (inHunk && text.startsWith("+"))
      return { text, kind: "add", old: null, next: next++ };
    if (inHunk && text.startsWith("-"))
      return { text, kind: "remove", old: old++, next: null };
    if (inHunk && text.startsWith(" "))
      return { text, kind: "context", old: old++, next: next++ };
    return { text, kind: "meta", old: null, next: null };
  });
}
