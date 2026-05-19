use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    App, Runtime,
};

/// Build the native menu bar.
///
/// On macOS this creates:
///   - 文件 (File): 打开仓库, 新建文件, 保存, 退出
///   - 编辑 (Edit): 撤销, 重做, 剪切, 复制, 粘贴
///   - 视图 (View): 切换侧边栏, 切换AI面板, 命令面板, 搜索
///   - 帮助 (Help): 关于
///
/// Menu events are forwarded to the frontend via `app.emit("menu-action", id)`.
pub fn setup_menu<R: Runtime>(app: &App<R>) -> Result<(), String> {
    // ── File menu ──────────────────────────────────────────────────────────
    let file_open_repo =
        MenuItem::with_id(app, "open-repo", "打开仓库...", true, Some("Ctrl+O"))
            .map_err(|e| e.to_string())?;
    let file_new =
        MenuItem::with_id(app, "new-file", "新建文件", true, Some("Ctrl+N"))
            .map_err(|e| e.to_string())?;
    let file_save = MenuItem::with_id(app, "save", "保存", true, Some("Ctrl+S"))
        .map_err(|e| e.to_string())?;
    let file_sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let file_quit = MenuItem::with_id(app, "quit", "退出", true, Some("Ctrl+Q"))
        .map_err(|e| e.to_string())?;

    let file_menu = Submenu::with_items(
        app,
        "文件",
        true,
        &[&file_open_repo, &file_new, &file_save, &file_sep, &file_quit],
    )
    .map_err(|e| e.to_string())?;

    // ── Edit menu ───────────────────────────────────────────────────────────
    let edit_undo = MenuItem::with_id(app, "undo", "撤销", true, Some("Ctrl+Z"))
        .map_err(|e| e.to_string())?;
    let edit_redo = MenuItem::with_id(app, "redo", "重做", true, Some("Ctrl+Shift+Z"))
        .map_err(|e| e.to_string())?;
    let edit_sep1 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let edit_cut = MenuItem::with_id(app, "cut", "剪切", true, Some("Ctrl+X"))
        .map_err(|e| e.to_string())?;
    let edit_copy = MenuItem::with_id(app, "copy", "复制", true, Some("Ctrl+C"))
        .map_err(|e| e.to_string())?;
    let edit_paste = MenuItem::with_id(app, "paste", "粘贴", true, Some("Ctrl+V"))
        .map_err(|e| e.to_string())?;

    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &edit_undo,
            &edit_redo,
            &edit_sep1,
            &edit_cut,
            &edit_copy,
            &edit_paste,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ── View menu ───────────────────────────────────────────────────────────
    let view_toggle_sidebar =
        MenuItem::with_id(app, "toggle-sidebar", "切换侧边栏", true, Some("Ctrl+B"))
            .map_err(|e| e.to_string())?;
    let view_toggle_ai =
        MenuItem::with_id(app, "toggle-ai-panel", "切换AI面板", true, Some("Ctrl+J"))
            .map_err(|e| e.to_string())?;
    let view_sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let view_command =
        MenuItem::with_id(app, "command-palette", "命令面板", true, Some("Ctrl+K"))
            .map_err(|e| e.to_string())?;
    let view_search =
        MenuItem::with_id(app, "global-search", "搜索", true, Some("Ctrl+Shift+F"))
            .map_err(|e| e.to_string())?;

    let view_menu = Submenu::with_items(
        app,
        "视图",
        true,
        &[
            &view_toggle_sidebar,
            &view_toggle_ai,
            &view_sep,
            &view_command,
            &view_search,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ── Help menu ───────────────────────────────────────────────────────────
    let help_about = MenuItem::with_id(app, "about", "关于 Increa Reader", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let help_menu =
        Submenu::with_items(app, "帮助", true, &[&help_about]).map_err(|e| e.to_string())?;

    // ── Assemble menu bar ───────────────────────────────────────────────────
    let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &help_menu])
        .map_err(|e| e.to_string())?;

    app.set_menu(menu).map_err(|e| e.to_string())?;

    Ok(())
}