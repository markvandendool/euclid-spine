/**
 * Khronos Clock AudioWorklet Processor
 *
 * Hardware-accurate timing source for the Khronos transport system.
 * Runs in AudioWorklet thread, providing precise beat calculations
 * based on AudioContext time.
 *
 * Architecture: AudioWorklet -> KhronosEngine -> KhronosBus -> UI
 *
 * @version MDF2030 Phase F
 */

class KhronosClock extends AudioWorkletProcessor {
  constructor() {
    super();
    this.tempo = 120; // BPM
    this.isPlaying = false;
    this.startTime = 0; // AudioContext time when playback started
    this.pausedElapsed = 0; // Accumulated time when paused
    this.lastPostTime = 0; // Throttle message rate
    // 🔥 QUANTUM RAILS RESTORE: Back to 60Hz for smooth playhead animation
    // The 30Hz throttle was causing visual jitter and FPS drops
    // CSS variable updates at 60Hz are fine - the issue was React re-renders (now fixed)
    this.messageInterval = 1 / 60; // ~60Hz update rate (16.67ms)

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      const data = event.data || {};

      switch (data.type) {
        case 'set-tempo':
          if (typeof data.tempo === 'number' && data.tempo > 0) {
            this.tempo = Math.max(20, Math.min(300, data.tempo));
          }
          break;

        case 'start':
          // Resume from paused position or start fresh
          this.startTime = currentTime - this.pausedElapsed;
          this.isPlaying = true;
          break;

        case 'pause':
          if (this.isPlaying) {
            this.pausedElapsed = currentTime - this.startTime;
          }
          this.isPlaying = false;
          break;

        case 'stop':
          this.startTime = currentTime;
          this.pausedElapsed = 0;
          this.isPlaying = false;
          break;

        case 'reset':
          this.startTime = currentTime;
          this.pausedElapsed = 0;
          this.isPlaying = data.playing || false;
          // Send confirmation back to main thread
          this.port.postMessage({ type: 'reset-complete', timestamp: currentTime });
          break;

        default:
          break;
      }
    };
  }

  process() {
    // Always return true to keep the processor alive
    if (!this.isPlaying) {
      return true;
    }

    // Throttle message rate to ~60Hz to avoid flooding the main thread
    if (currentTime - this.lastPostTime < this.messageInterval) {
      return true;
    }
    this.lastPostTime = currentTime;

    // Calculate elapsed time since playback started
    const elapsedSeconds = currentTime - this.startTime;

    // Convert to beats based on tempo
    // beats = (elapsedSeconds * tempo) / 60
    const beats = elapsedSeconds * (this.tempo / 60);
    const beat = Math.floor(beats);
    const beatFraction = beats - beat;

    // Calculate measure (assuming 4/4 time signature)
    // TODO: Accept time signature from engine for proper measure calculation
    const measure = Math.floor(beat / 4);

    // Post beat update to main thread
    this.port.postMessage({
      currentTime: currentTime,
      beat: beat,
      beatFraction: beatFraction,
      measure: measure,
      tempo: this.tempo,
      elapsedSeconds: elapsedSeconds,
    });

    return true;
  }
}

// Register the processor with the AudioWorklet system
registerProcessor('khronos-clock', KhronosClock);
