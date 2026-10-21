const { join } = require('node:path')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const https = require('node:https')
const http = require('node:http')
const { execFile } = require('node:child_process')

const MODEL_DIR_NAME = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17'
const MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2'
const MODEL_FILE = 'model.int8.onnx'
const TOKENS_FILE = 'tokens.txt'

function modelsDir(baseDir) {
  return join(baseDir, 'sensevoice')
}

function modelPath(userDataDir) {
  return join(modelsDir(userDataDir), MODEL_DIR_NAME)
}

function modelReady(userDataDir) {
  const dir = modelPath(userDataDir)
  return existsSync(join(dir, MODEL_FILE)) && existsSync(join(dir, TOKENS_FILE))
}

function createAsrEngine(userDataDir, onProgress) {
  let recognizer = null
  let stream = null
  let enabled = false

  function init() {
    if (recognizer) return recognizer
    const dir = modelPath(userDataDir)
    if (!modelReady(userDataDir)) throw new Error('模型未就绪，请先下载')
    const so = require('sherpa-onnx-node')
    recognizer = new so.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: {
          model: join(dir, MODEL_FILE),
          useInverseTextNormalization: true,
        },
        tokens: join(dir, TOKENS_FILE),
        numThreads: 2,
        provider: 'cpu',
        debug: false,
      },
    })
    return recognizer
  }

  function createStream() {
    const rec = init()
    stream = rec.createStream()
    return stream
  }

  function feedSamples(float32Array) {
    if (stream) stream.acceptWaveform({ samples: float32Array, sampleRate: 16000 })
  }

  function decodeStream() {
    if (!recognizer || !stream) return ''
    recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    return result?.text || ''
  }

  function freeStream() {
    stream = null
  }

  function destroy() {
    freeStream()
    recognizer = null
  }

  // Read a PCM WAV file without sherpa's readWave: its returned Float32Array
  // is backed by external memory, which Electron rejects with
  // "External buffers are not allowed". We parse RIFF/PCM ourselves.
  function readWavSamples(filePath) {
    const buf = require('node:fs').readFileSync(filePath)
    if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF/WAV file')
    let offset = 12
    let fmt = null
    let data = null
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4)
      const size = buf.readUInt32LE(offset + 4)
      if (id === 'fmt ') fmt = { audioFormat: buf.readUInt16LE(offset + 8), channels: buf.readUInt16LE(offset + 10), sampleRate: buf.readUInt32LE(offset + 12), bitsPerSample: buf.readUInt16LE(offset + 22) }
      if (id === 'data') data = buf.subarray(offset + 8, offset + 8 + size)
      offset += 8 + size + (size % 2)
    }
    if (!fmt || !data) throw new Error('WAV missing fmt/data chunk')
    if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) throw new Error(`unsupported WAV format=${fmt.audioFormat} bits=${fmt.bitsPerSample}`)
    const frameCount = Math.floor(data.length / (2 * fmt.channels))
    const mono = new Float32Array(frameCount)
    for (let i = 0; i < frameCount; i++) {
      let acc = 0
      for (let c = 0; c < fmt.channels; c++) acc += data.readInt16LE((i * fmt.channels + c) * 2) / 32768
      mono[i] = acc / fmt.channels
    }
    if (fmt.sampleRate === 16000) return { samples: mono, sampleRate: 16000 }
    // Linear resample to 16kHz
    const ratio = fmt.sampleRate / 16000
    const outLen = Math.floor(frameCount / ratio)
    const out = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) out[i] = mono[Math.floor(i * ratio)]
    return { samples: out, sampleRate: 16000 }
  }

  function transcribeSamples(samples) {
    const rec = init()
    const s = rec.createStream()
    s.acceptWaveform({ samples, sampleRate: 16000 })
    rec.decode(s)
    const result = rec.getResult(s)
    return result?.text || ''
  }

  function transcribeFile(filePath) {
    const rec = init()
    const { samples, sampleRate } = readWavSamples(filePath)
    const s = rec.createStream()
    s.acceptWaveform({ samples, sampleRate })
    rec.decode(s)
    const result = rec.getResult(s)
    return result?.text || ''
  }

  return {
    init,
    createStream,
    feedSamples,
    decodeStream,
    freeStream,
    destroy,
    transcribeSamples,
    transcribeFile,
    get stream() { return stream },
    isReady: () => modelReady(userDataDir),
    get enabled() { return enabled },
    set enabled(v) { enabled = v },
  }
}

function downloadModel(userDataDir, onProgress, onDone) {
  const dir = modelsDir(userDataDir)
  mkdirSync(dir, { recursive: true })
  const tarPath = join(dir, 'model.tar.bz2')
  const file = require('node:fs').createWriteStream(tarPath)
  let downloaded = 0

  const request = https.get(MODEL_URL, {
    headers: { 'User-Agent': 'DeskDSH' },
    followRedirect: true,
  }, response => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      file.destroy()
      return downloadModelFromUrl(response.headers.location, tarPath, userDataDir, onProgress, onDone)
    }
    if (response.statusCode !== 200) {
      file.destroy()
      return onDone(new Error(`HTTP ${response.statusCode}`))
    }
    const total = parseInt(response.headers['content-length'] || '0', 10)
    response.on('data', chunk => {
      downloaded += chunk.length
      file.write(chunk)
      if (total > 0) onProgress(Math.round((downloaded / total) * 90))
      else onProgress(-1)
    })
    response.on('end', () => {
      file.end(() => {
        extractModel(tarPath, dir, () => {
          try { require('node:fs').unlinkSync(tarPath) } catch {}
          onProgress(100)
          onDone(null)
        })
      })
    })
  })
  request.on('error', error => {
    file.destroy()
    onDone(error)
  })
}

function downloadModelFromUrl(url, tarPath, userDataDir, onProgress, onDone) {
  const proto = url.startsWith('https:') ? https : http
  const file = require('node:fs').createWriteStream(tarPath)
  let downloaded = 0
  const req = proto.get(url, response => {
    if (response.statusCode !== 200) {
      file.destroy()
      return onDone(new Error(`HTTP ${response.statusCode}`))
    }
    const total = parseInt(response.headers['content-length'] || '0', 10)
    response.on('data', chunk => {
      downloaded += chunk.length
      file.write(chunk)
      if (total > 0) onProgress(Math.round((downloaded / total) * 90))
      else onProgress(-1)
    })
    response.on('end', () => {
      file.end(() => {
        extractModel(tarPath, modelsDir(userDataDir), () => {
          try { require('node:fs').unlinkSync(tarPath) } catch {}
          onProgress(100)
          onDone(null)
        })
      })
    })
  })
  req.on('error', error => {
    file.destroy()
    onDone(error)
  })
}

function extractModel(tarPath, destDir, callback) {
  execFile('tar', ['-xjf', tarPath, '-C', destDir], error => {
    if (error) callback(new Error(`解压失败: ${error.message}`))
    else callback()
  })
}

module.exports = { createAsrEngine, downloadModel, modelReady, modelPath }
