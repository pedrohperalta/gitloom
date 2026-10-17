import type { MessageKey } from "./i18n";
export function errorGuidance(error: string): MessageKey | null {
  if (
    [
      "staleHunk",
      "hunkUnavailable",
      "finishOperation",
      "missingUpstream",
    ].includes(error)
  )
    return error as MessageKey;
  if (
    /authentication failed|permission denied.*publickey|could not read (username|password)|terminal prompts disabled|host key verification failed/i.test(
      error,
    )
  )
    return "authGuidance";
  if (
    /not possible to fast-forward|non-fast-forward|fetch first|tip of your current branch is behind/i.test(
      error,
    )
  )
    return "divergenceGuidance";
  if (/no tracking information|no upstream|sem upstream/i.test(error))
    return "missingUpstream";
  if (/would be overwritten|please commit your changes or stash/i.test(error))
    return "dirtyGuidance";
  if (/unmerged files|resolve.*conflict|conflitos/i.test(error))
    return "conflictGuidance";
  if (/unable to auto-detect email|author identity unknown/i.test(error))
    return "identityGuidance";
  if (/failed to sign|gpg.*failed|signing failed/i.test(error))
    return "signingGuidance";
  if (/index\.lock|another git process/i.test(error)) return "lockGuidance";
  if (
    /120 segundos|timed out|could not resolve host|unable to access|could not read from remote/i.test(
      error,
    )
  )
    return "connectionGuidance";
  return null;
}
