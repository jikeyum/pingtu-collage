# 拼图工坊 / PinTu Collage

> **Note:** This repository is prepared for GitHub and SignPath Foundation onboarding.
> Replace `jikeyum` in links after creating the repository.

A local-first Windows collage app built with Tauri 2, Rust and Canvas.

- 1–9 images per collage
- 5 layouts, 11 aspect ratios, 5 output long edges
- Borders, spacing, corner radius, background color
- PNG/JPG/WebP export with high-quality resampling
- Local-only processing; no uploads

## Development quick start

```powershell
cargo build --release --manifest-path .\src-tauri\Cargo.toml
```

## Code signing

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

See [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md).

## License

MIT

