// Prevents additional console window on Windows in release; not relevant on macOS but kept for parity.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    md_collab_native_client_lib::run();
}
