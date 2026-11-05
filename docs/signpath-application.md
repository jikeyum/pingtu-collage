# SignPath Foundation application notes

This file contains the information to paste into the SignPath Foundation application at
<https://signpath.org/apply>. It is intentionally kept in the repository so the
application, code-signing policy and release notes stay consistent.

## Project

- **Project name:** PinTu Collage / 拼图工坊
- **Repository:** `https://github.com/jikeyum/pingtu-collage` (replace after repository creation)
- **License:** MIT (OSI-approved)
- **Platform:** Windows 10/11 x64
- **Language:** Rust + HTML/CSS/JavaScript (Tauri 2)
- **Current release:** see the repository's Releases page
- **Download page:** repository Releases page
- **Documentation:** `README.md`
- **Code signing policy:** `CODE_SIGNING_POLICY.md` and the README section

## Description

PinTu Collage is a local-first Windows desktop app that combines 1–9 images
into a collage. It uses Tauri 2, Rust, WebView2 and an HTML Canvas renderer.
Images are processed locally and never uploaded. The application supports
layout presets, aspect ratios, borders, PNG/JPG/WebP export, high-quality
downscaling and per-user export settings.

## Signing scope

Only `dist/拼图工坊.exe` (internal name `pingtu-collage.exe`) built by the
GitHub Actions workflow from a tagged commit is submitted for signing.

## Build and provenance

```text
CI: GitHub Actions, windows-latest
Command: cargo build --release --manifest-path src-tauri/Cargo.toml
Artifact: dist/拼图工坊.exe
```

The workflow is in `.github/workflows/build.yml`. A manual SignPath workflow
template is in `.github/workflows/signpath.yml`; it is kept disabled until
SignPath provides the organization/project/policy/artifact-configuration IDs.

## Code signing policy statement

**Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).**

Roles:

- Authors / Committers / Reviewers: repository owner
- Approvers: repository owner

Every signing request is manually approved. External changes require a pull
request and maintainer review.

## Privacy

The application does not upload images, project content or usage records.
The full policy is in `PRIVACY.md`.

## Notes for the reviewer

- The app does not include telemetry, advertising SDKs, accounts or cloud sync.
- The optional elevated helper is a one-shot copy helper used only after the
  user explicitly selects a protected export directory and approves Windows UAC.
- The project is currently a single-maintainer project; the maintainer is the
  author, reviewer and signing approver.

