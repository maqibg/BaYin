use crate::audio_engine::engine::{AudioCommand, PlaybackState};
use crate::audio_engine::AudioEngineState;
use tauri::State;

#[tauri::command]
pub fn audio_play(source: String, engine: State<'_, AudioEngineState>) {
    #[cfg(debug_assertions)]
    eprintln!("audio_play: {}", source);
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::Play { source });
}

#[tauri::command]
pub fn audio_pause(engine: State<'_, AudioEngineState>) {
    #[cfg(debug_assertions)]
    eprintln!("audio_pause");
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::Pause);
}

#[tauri::command]
pub fn audio_resume(engine: State<'_, AudioEngineState>) {
    #[cfg(debug_assertions)]
    eprintln!("audio_resume");
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::Resume);
}

#[tauri::command]
pub fn audio_stop(engine: State<'_, AudioEngineState>) {
    #[cfg(debug_assertions)]
    eprintln!("audio_stop");
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::Stop);
}

#[tauri::command]
pub fn audio_seek(position_secs: f64, engine: State<'_, AudioEngineState>) {
    #[cfg(debug_assertions)]
    eprintln!("audio_seek: {}", position_secs);
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::Seek { position_secs });
}

#[tauri::command]
pub fn audio_set_volume(volume: f32, engine: State<'_, AudioEngineState>) {
    #[cfg(debug_assertions)]
    eprintln!("audio_set_volume: {}", volume);
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::SetVolume { volume });
}

#[tauri::command]
pub fn audio_set_eq_bands(gains: Vec<f32>, engine: State<'_, AudioEngineState>) {
    if gains.len() != 10 {
        return;
    }
    #[cfg(debug_assertions)]
    eprintln!("audio_set_eq_bands: {:?}", gains);
    let mut arr = [0.0f32; 10];
    arr.copy_from_slice(&gains);
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::SetEqBands { gains: arr });
}

#[tauri::command]
pub fn audio_set_eq_enabled(enabled: bool, engine: State<'_, AudioEngineState>) {
    #[cfg(debug_assertions)]
    eprintln!("audio_set_eq_enabled: {}", enabled);
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::SetEqEnabled { enabled });
}

#[tauri::command]
pub fn audio_enable_visualization(enabled: bool, engine: State<'_, AudioEngineState>) {
    let engine = engine.lock().unwrap();
    engine.send(AudioCommand::EnableVisualization { enabled });
}

#[tauri::command]
pub fn audio_get_state(engine: State<'_, AudioEngineState>) -> PlaybackState {
    let engine = engine.lock().unwrap();
    let state = engine.state.lock().unwrap().clone();
    state
}
