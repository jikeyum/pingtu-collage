# Building and releasing

## Local build

Requirements:

- Windows 10/11 x64
- Rust stable with the MSVC toolchain
- Visual Studio 2022/2026 with the Desktop development with C++ workload
- WebView2 Runtime

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\build_windows.ps1
```

Output: `dist\拼图工坊.exe`.

## CI build

`.github/workflows/build.yml` runs on `windows-latest` and uploads the unsigned
`拼图工坊.exe` artifact.

## Release

1. Update `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` versions.
2. Commit and push.
3. Create a GitHub release/tag, for example `v5.0.0`.
4. Attach the CI artifact `拼图工坊.exe` or a zip containing it.
5. After SignPath onboarding, enable `.github/workflows/signpath.yml` and fill
   the repository variables described in that file.

## SignPath enrollment status

The SignPath Foundation application is pending. Do not enable the signing
workflow until the project has been approved and the SignPath organization,
project, signing policy and artifact configuration IDs are available.

