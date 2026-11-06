// Parakeet Ultra on the Neural Engine, for a room. FluidAudio runs the Core ML
// build of the model. The main process (parakeetAne.js) keeps one helper running
// and talks to it in JSON lines:
//
//   helper  {"ready":true}
//   main    {"id":1,"pcm":"<base64: 16-bit little-endian mono PCM at 16 kHz>","keepFrom":8.0}
//   helper  {"id":1,"text":"What was said."}   or   {"id":1,"error":"..."}
//
// A segment is short and the model reads 15 s at once, so main sends the seconds
// before the segment too, as context. `keepFrom` says where the segment starts, and
// only the words from there on come back.
//
// The audio stays in memory: nothing here writes a segment to disk, and nothing here
// reaches the network. The main process fetches the models. Why this model, and the
// numbers behind the gate below: docs/speech-round-2.md.
import CoreML
import FluidAudio
import Foundation

/// Standard output carries the protocol. Logging from the library goes to stderr.
func say(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
}

func flag(_ name: String) -> String? {
  let args = CommandLine.arguments
  guard let at = args.firstIndex(of: "--\(name)"), at + 1 < args.count else { return nil }
  return args[at + 1]
}

func samples(_ base64: String) -> [Float]? {
  guard let data = Data(base64Encoded: base64) else { return nil }
  return data.withUnsafeBytes { raw in
    raw.bindMemory(to: Int16.self).map { Float(Int16(littleEndian: $0)) / 32768 }
  }
}

/// A segment with no speech must not reach the model: Parakeet has no VAD of its
/// own and writes short phrases into silence. Silero's probability, 2 chunks of
/// 256 ms in a row at the threshold, or the one chunk a short segment has.
func holdsSpeech(_ chunks: [VadResult]) -> Bool {
  let threshold: Float = 0.85
  let needed = min(2, chunks.count)
  var run = 0
  for chunk in chunks {
    run = chunk.probability >= threshold ? run + 1 : 0
    if needed > 0 && run >= needed { return true }
  }
  return false
}

/// The first token of a word can land this far before the word's segment starts.
/// Picked on the tune meetings from 0 to 0.64 s (docs/speech-round-2.md).
let wordStartSlack = 0.32

/// A read's words from the segment's start on. A word counts where its first token
/// starts, with the slack. In the slack a word can be the one the last segment ended
/// on: then it is that word again, and it is left out.
func words(_ timings: [TokenTiming], from start: Double, after lastWord: String) -> [String] {
  var groups: [[TokenTiming]] = []
  for timing in timings {
    if timing.token.hasPrefix("\u{2581}") || timing.token.hasPrefix(" ") || groups.isEmpty {
      groups.append([timing])
    } else {
      groups[groups.count - 1].append(timing)
    }
  }
  var kept = groups.filter { $0[0].startTime >= start - wordStartSlack }
  if let first = kept.first, first[0].startTime < start, bare(text(first)) == lastWord {
    kept.removeFirst()
  }
  return kept.map(text)
}

func text(_ tokens: [TokenTiming]) -> String {
  tokens.map(\.token).joined().replacingOccurrences(of: "\u{2581}", with: "")
    .trimmingCharacters(in: .whitespaces)
}

func bare(_ word: String) -> String {
  word.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "'" }
}

func serve(_ directory: URL) async throws {
  // With this set FluidAudio refuses every request: a missing model is an error,
  // never a download.
  ModelHub.offlineMode = true
  let models = directory.appendingPathComponent("parakeet-ultra", isDirectory: true)
  let silero = directory.appendingPathComponent(ModelNames.VAD.sileroVadFile, isDirectory: true)
  let configuration = MLModelConfiguration()
  configuration.computeUnits = .cpuAndNeuralEngine
  let vad = VadManager(config: .default, vadModel: try MLModel(contentsOf: silero, configuration: configuration))
  let manager = AsrManager(config: .default)
  try await manager.loadModels(AsrModels.load(from: models, version: .ultra))
  let layers = await manager.decoderLayerCount
  var lastWord = ""
  say(["ready": true])
  while let line = readLine() {
    guard let data = line.data(using: .utf8),
      let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let id = request["id"], let pcm = request["pcm"] as? String
    else { continue }
    do {
      guard let audio = samples(pcm) else {
        say(["id": id, "error": "the pcm is not base64"])
        continue
      }
      let keepFrom = request["keepFrom"] as? Double ?? 0
      let segment = Array(audio[min(audio.count, Int(keepFrom * 16000))...])
      guard holdsSpeech(try await vad.process(segment)) else {
        say(["id": id, "text": ""])
        continue
      }
      var state = TdtDecoderState.make(decoderLayers: layers)
      let result = try await manager.transcribe(audio, decoderState: &state)
      guard keepFrom > 0 else {
        say(["id": id, "text": result.text])
        continue
      }
      let kept = words(result.tokenTimings ?? [], from: keepFrom, after: lastWord)
      if let last = kept.last { lastWord = bare(last) }
      say(["id": id, "text": kept.joined(separator: " ")])
    } catch {
      say(["id": id, "error": "\(error)"])
    }
  }
}

@main
struct Helper {
  static func main() async {
    guard let root = flag("models") else {
      FileHandle.standardError.write(Data("usage: macos-parakeet-ane --models <dir>\n".utf8))
      exit(2)
    }
    do {
      try await serve(URL(fileURLWithPath: root, isDirectory: true))
    } catch {
      FileHandle.standardError.write(Data("macos-parakeet-ane: \(error)\n".utf8))
      exit(1)
    }
  }
}
