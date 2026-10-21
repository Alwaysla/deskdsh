// Voice audio capture and streaming logic (runs in the voice settings window renderer)
let mediaStream = null
let audioContext = null
let processor = null
let sourceNode = null
let muteGain = null
let capturing = false

async function startCapture(deviceId) {
  if (capturing) return true
  try {
    const constraints = {
      audio: {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
        sampleRate: { ideal: 16000 },
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    }
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    const sampleRate = audioContext.sampleRate
    sourceNode = audioContext.createMediaStreamSource(mediaStream)

    // ScriptProcessor for compatibility; route through a zero-gain node so the
    // mic is never played back through the speakers.
    processor = audioContext.createScriptProcessor(4096, 1, 1)
    muteGain = audioContext.createGain()
    muteGain.gain.value = 0

    processor.onaudioprocess = event => {
      if (!capturing) return
      const input = event.inputBuffer.getChannelData(0)
      if (sampleRate !== 16000) {
        const ratio = sampleRate / 16000
        const newLength = Math.floor(input.length / ratio)
        const downsampled = new Float32Array(newLength)
        for (let i = 0; i < newLength; i++) downsampled[i] = input[Math.floor(i * ratio)]
        sendChunk(downsampled)
      } else {
        sendChunk(new Float32Array(input))
      }
    }

    sourceNode.connect(processor)
    processor.connect(muteGain)
    muteGain.connect(audioContext.destination)
    capturing = true
    return true
  } catch (e) {
    console.error('Audio capture failed:', e)
    return false
  }
}

function sendChunk(float32Array) {
  // contextBridge cannot serialize ArrayBuffer/TypedArray arguments; send a
  // plain number array instead (~4096 floats per 256ms chunk).
  window.deskDshVoice.sendAudioChunk(Array.from(float32Array))
}

function stopCapture() {
  capturing = false
  if (processor) { processor.disconnect(); processor = null }
  if (muteGain) { muteGain.disconnect(); muteGain = null }
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null }
  if (audioContext && audioContext.state !== 'closed') { audioContext.close(); audioContext = null }
  window.deskDshVoice.sendAudioEnd?.()
}

async function startLoopbackCapture() {
  try {
    // A short probe stream unlocks device labels, then we pick the loopback
    // source: prefer the DeskDSH-Loopback virtual source created by the main
    // process (PipeWire systems don't expose raw monitors), then any monitor.
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
    probe.getTracks().forEach(t => t.stop())
    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices.filter(d => d.kind === 'audioinput')
    const target = inputs.find(d => /deskdsh-loopback/i.test(d.label))
      || inputs.find(d => /monitor/i.test(d.label))
    if (!target) return { ok: false, error: 'no-monitor' }
    const ok = await startCapture(target.deviceId)
    return { ok }
  } catch (e) {
    console.error('Loopback capture failed:', e)
    return { ok: false, error: String(e.message || e) }
  }
}

// Expose to voice.js
window._voiceCapture = { startCapture, stopCapture, startLoopbackCapture, isCapturing: () => capturing }
