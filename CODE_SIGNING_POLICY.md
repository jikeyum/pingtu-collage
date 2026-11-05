# Code signing policy

**Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).**

## Scope

Only Windows release binaries built by GitHub Actions in this repository from a tagged commit are submitted for signing. The signed artifact is the application executable `拼图工坊.exe` (internal name `pingtu-collage.exe`) produced by the workflow in `.github/workflows/build.yml`.

No third-party binaries, sample images or locally built development artifacts are signed.

## Roles

This is currently a single-maintainer project.

- **Authors / Committers / Reviewers**: the repository owner and maintainer.
- **Approvers**: the repository owner and maintainer.

External contributions are submitted as pull requests and must be reviewed by the maintainer before merge. Every signing request is manually approved by the maintainer after checking the tagged commit, workflow run and artifact hash.

## Build provenance

- CI: GitHub Actions, `windows-latest`
- Source: public repository, tagged release commit
- Build command: `cargo build --release --manifest-path src-tauri/Cargo.toml`
- Artifact: `dist/拼图工坊.exe`
- Signing requests are created only from the CI artifact, never from a local build.

## Privacy

The application processes images locally and does not upload user data. See [PRIVACY.md](PRIVACY.md).

## Security

Security reports are handled according to [SECURITY.md](SECURITY.md). The project does not contain malware, hacking tools or code that circumvents security controls. The optional elevated helper is only used to write an already-rendered export to a directory the user explicitly selected, after a standard Windows UAC prompt.

## Changes

Any change to this policy will be committed to this repository and linked from the README.

