// public/audio-processor.js
class PCM16Processor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0][0]; // mono channel
    if (!input || input.length === 0) return true;

    // Float32 → Int16 PCM (ElevenLabs/Django expects this)
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      let sample = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    // Send binary buffer to main thread
    this.port.postMessage(pcm.buffer, [pcm.buffer]);

    return true;
  }
}

registerProcessor("pcm-16-processor", PCM16Processor);