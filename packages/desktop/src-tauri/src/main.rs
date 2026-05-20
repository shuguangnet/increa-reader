// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    increa_reader::build_app()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
