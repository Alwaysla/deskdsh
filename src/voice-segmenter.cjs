// Energy-based voice activity segmentation.
// Feeds PCM chunks, detects speech onsets/offsets by RMS energy, and calls
// onSegment with each finished speech segment so long recordings transcribe
// incrementally instead of one huge decode at the end.

function createSegmenter({
  onSegment,
  threshold = 0.01,
  minSpeechChunks = 3,      // consecutive energetic chunks to open a segment
  maxSilenceChunks = 2,     // ~0.5s of silence closes the segment
  maxSegmentChunks = 39,    // ~10s force-cut for long monologues
  preRollChunks = 2,        // keep ~0.5s before onset so starts aren't clipped
} = {}) {
  let preRoll = []
  let segment = []
  let speaking = false
  let silenceRun = 0
  let speechRun = 0

  function rms(chunk) {
    let sum = 0
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
    return Math.sqrt(sum / chunk.length)
  }

  function emit() {
    if (!segment.length) return
    const total = segment.reduce((n, c) => n + c.length, 0)
    const samples = new Float32Array(total)
    let offset = 0
    for (const c of segment) { samples.set(c, offset); offset += c.length }
    segment = []
    speaking = false
    speechRun = 0
    silenceRun = 0
    onSegment(samples, total / 16000)
  }

  function feed(chunk) {
    const energy = rms(chunk)
    if (!speaking) {
      preRoll.push(chunk)
      if (preRoll.length > preRollChunks) preRoll.shift()
      speechRun = energy > threshold ? speechRun + 1 : 0
      if (speechRun >= minSpeechChunks) {
        speaking = true
        silenceRun = 0
        segment = preRoll.splice(0)
      }
    } else {
      segment.push(chunk)
      silenceRun = energy <= threshold ? silenceRun + 1 : 0
      if (silenceRun >= maxSilenceChunks || segment.length >= maxSegmentChunks) emit()
    }
  }

  function flush() {
    // Close any in-progress segment (manual stop mid-speech)
    emit()
    preRoll = []
  }

  return { feed, flush, get speaking() { return speaking } }
}

module.exports = { createSegmenter }
