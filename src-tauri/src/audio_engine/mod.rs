pub mod decoder;
pub mod dsp;
pub mod engine;
pub mod fft;
pub mod output;
pub mod resampler;

use engine::AudioEngine;
use std::sync::Mutex;

pub type AudioEngineState = Mutex<AudioEngine>;
