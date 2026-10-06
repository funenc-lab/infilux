# macOS Permission Identity Repair

## Context

The installed local build is unsigned, while the previous release was signed by
Developer ID Application team `SG6MVT62JU`. macOS TCC reports that the existing
code requirement does not match when an Infilux-owned `find` process visits
protected folders. The latest signed release predates the session-input and
startup fixes in the current source tree.

## Decision

Tag builds must import the release certificate successfully and must not fall
back to unsigned output. Before a tag build can finish, verify the packaged
macOS app with `codesign` and confirm its Developer ID Application signer and
team `SG6MVT62JU`. Keep unsigned builds available only for untagged manual CI
runs; they must not become release assets or replace a signed installation.

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
signature and team verification before the release-notes job can publish the
draft release. Tests cover the workflow branches and verification wiring.

This machine has no Developer ID signing identity or authenticated GitHub CLI.
Publishing and replacing the local installation require a signed artifact from
an authorized release environment; this design does not grant broad disk access
or reset TCC permissions as a workaround.
