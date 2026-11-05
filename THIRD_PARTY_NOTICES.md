# Third-party notices

This project is built with open-source components. The main direct dependencies are:

- [Tauri](https://tauri.app/) — MIT / Apache-2.0
- [rfd](https://github.com/PolyMeilex/rfd) — MIT
- [serde](https://serde.rs/) — MIT / Apache-2.0
- [base64](https://github.com/marshallpierce/rust-base64) — MIT / Apache-2.0
- [mime_guess](https://github.com/abonander/mime_guess) — MIT
- [windows-sys](https://github.com/microsoft/windows-rs) — MIT / Apache-2.0

The Windows build uses the system **Microsoft Edge WebView2 Runtime**, which is a Microsoft system component and is not redistributed by this repository.

Sample images under `frontend/samples/` are generated demo assets for the application.

The full dependency graph and licenses are available from `src-tauri/Cargo.lock` and the published crates.

