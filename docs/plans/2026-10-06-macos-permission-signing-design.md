# macOS Permission Identity Repair

## Context

The installed local build is unsigned, while the previous release was signed by
Developer ID Application team `SG6MVT62JU`. macOS TCC reports that the existing
code requirement does not match when an Infilux-owned `find` process visits
protected folders. The latest signed release predates the session-input and
startup fixes in the current source tree.

## Decision

Tag builds must import the release certificate successfully and must not fall
back to unsigned output. Build macOS packages with `--publish never` so CI
cannot upload artifacts before checking the packaged app with `codesign` and
confirming its Developer ID Application signer and team `SG6MVT62JU`. Only then
upload the signed DMG, ZIP, and both blockmaps to a draft release, without replacing assets on
an already published release. Keep unsigned builds available only for untagged
manual CI runs; they must never become release assets or replace a signed
installation. Serialize entire workflow runs for the same ref so a retry cannot
overwrite release assets after a prior run publishes the draft.

Alternatives considered:

- Ad-hoc signing the local bundle would not preserve the previous Developer ID
  identity and would change again on subsequent builds.
- Restoring the previous signed release would reintroduce already-fixed agent
  input and startup bugs.
- A signed release of the current code preserves the app's permission identity
  and the fixes. This is the selected path.

## Boundaries And Verification

The release workflow owns the signing gate; the app's file-access IPC and TCC
database remain unchanged. CI must fail before invoking an unsigned tag build
if signing prerequisites or certificate import fail. A signed build must pass
signature and team verification before its packages are uploaded; the
release-notes job merges and uploads update metadata before publishing the
draft release. Tests cover the workflow branches and upload ordering.

This machine has no Developer ID signing identity or authenticated GitHub CLI.
Publishing and replacing the local installation require a signed artifact from
an authorized release environment; this design does not grant broad disk access
or reset TCC permissions as a workaround.
