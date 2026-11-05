/*
 * Tauri v2 bridge for the existing Canvas frontend.
 * Keeps the UI code browser-previewable while routing native file dialogs,
 * saving, and Explorer drops through Rust commands.
 */
(function () {
  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke || tauri?.tauri?.invoke || null;
  if (!invoke) {
    window.__pingtuTauriApi = null;
    return;
  }

  window.__pingtuTauriApi = {
    choose_export_path: (name, ext) =>
      invoke("choose_export_path", { name, ext }),
    choose_export_folder: () => invoke("choose_export_folder", {}),
    get_export_dir: () => invoke("get_export_dir", {}),
    open_export_folder: (path) => invoke("open_export_folder", { path }),
    write_image: (data, path) => invoke("write_image", { data, path }),
    save_image: (data, name, ext, quick) =>
      invoke("save_image", { data, name, ext, quick }),
  };

  const listen = tauri?.event?.listen;
  if (!listen) return;

  async function onDrop(event) {
    const payload = event?.payload ?? event;
    const paths = Array.isArray(payload) ? payload : payload?.paths || [];
    if (!paths.length) return;
    try {
      const images = await invoke("read_images", { paths });
      window.dispatchEvent(new CustomEvent("pingtu-tauri-drop", { detail: images }));
    } catch (error) {
      console.error("Tauri drop import failed", error);
      window.dispatchEvent(new CustomEvent("pingtu-tauri-drop-error", { detail: error }));
    }
  }

  // Tauri 2 uses tauri://drag-drop; older builds used tauri://file-drop.
  listen("tauri://drag-drop", onDrop);
  listen("tauri://file-drop", onDrop);
})();
