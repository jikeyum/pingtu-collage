# 隐私政策 / Privacy Policy

生效日期：2026-11-05

## 中文

拼图工坊是一个本地桌面应用。

- 图片只在用户选择的电脑上读取、解码、排版、合成和导出。
- 应用不会把图片、项目内容或使用记录上传到任何服务器。
- 应用不包含账号系统、云同步、遥测或广告 SDK。
- 应用只在用户主动选择路径时访问文件；导出路径和界面设置保存在本机 WebView2 存储中。
- 应用使用系统 WebView2 运行时。WebView2 是 Windows 的系统组件，其自身的更新和诊断行为由 Microsoft 管理，详见 Microsoft 隐私声明。
- 导出到受保护目录时，应用会通过 Windows UAC 启动同一个 exe 的临时管理员 helper 完成写入；该 helper 只复制用户已生成的目标文件。
- 用户可以在应用目录或 `%LOCALAPPDATA%` 下删除 WebView2 数据来清除本机设置。

联系方式：通过本仓库 Issues 联系维护者。

## English

PinTu Collage is a local desktop application.

- Images are read, decoded, laid out, composited and exported only on the user's computer.
- The application does not upload images, project contents or usage records to any server.
- There is no account system, cloud sync, telemetry or advertising SDK.
- Files are accessed only at paths the user selects. Export paths and UI settings are stored locally in WebView2 storage.
- The application uses the system WebView2 runtime. WebView2 is a Windows system component; its own update and diagnostic behavior is managed by Microsoft under the Microsoft Privacy Statement.
- When exporting to a protected directory, the app may launch the same executable as a temporary elevated helper through Windows UAC. The helper only copies the already-generated target file.
- Users can delete WebView2 data under the application directory or `%LOCALAPPDATA%` to clear local settings.

Contact: open an issue in this repository.

