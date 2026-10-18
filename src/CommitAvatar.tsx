import { useEffect, useRef, useState } from "react";
import type { Commit } from "./types";

const lookups = new Map<string, Promise<string | null>>();
let retryAfter = 0;
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .filter((_, i, parts) => i === 0 || i === parts.length - 1)
      .map((part) => Array.from(part)[0])
      .join("")
      .toLocaleUpperCase() || "?"
  );
}
function avatar(commit: Commit, repository: string): Promise<string | null> {
  const key = `${repository}:${commit.committerEmail || commit.hash}`;
  const githubId = /^(\d+)\+[^@]+@users\.noreply\.github\.com$/i.exec(
    commit.committerEmail || "",
  )?.[1];
  if (githubId)
    return Promise.resolve(
      `https://avatars.githubusercontent.com/u/${githubId}?s=64`,
    );
  if (!lookups.has(key)) {
    lookups.set(
      key,
      (async () => {
        if (Date.now() < retryAfter) return null;
        try {
          const response = await fetch(
            `https://api.github.com/repos/${repository}/commits/${commit.hash}`,
            {
              signal: AbortSignal.timeout(8000),
              credentials: "omit",
              referrerPolicy: "no-referrer",
            },
          );
          if (response.status === 403 || response.status === 429)
            retryAfter = Date.now() + 3600000;
          if (!response.ok) return null;
          const data = await response.json();
          const url = new URL(data.committer?.avatar_url);
          return url.protocol === "https:" &&
            url.hostname === "avatars.githubusercontent.com"
            ? url.href
            : null;
        } catch {
          return null;
        }
      })(),
    );
  }
  return lookups.get(key)!;
}
export function CommitAvatar({
  commit,
  repository,
}: {
  commit: Commit;
  repository?: string | null;
}) {
  const [source, setSource] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const name = commit.committer || commit.author;
  useEffect(() => {
    setSource(null);
    if (
      !ref.current ||
      (!repository &&
        !/^\d+\+[^@]+@users\.noreply\.github\.com$/i.test(
          commit.committerEmail || "",
        ))
    )
      return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void avatar(commit, repository || "").then((url) => {
        if (active) setSource(url);
      });
    });
    observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [commit.hash, commit.committerEmail, repository]);
  return (
    <span ref={ref} className="commit-avatar" title={name}>
      {source ? (
        <img
          src={source}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setSource(null)}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}
