// FluidAudio's Core ML models as a `room-replay.js --engine` (the line protocol
// is in room-replay.js's header): on the Neural Engine unless told otherwise.
import CoreML
import FluidAudio
import Foundation

func say(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
}

func flag(_ name: String, _ fallback: String) -> String {
  let args = CommandLine.arguments
  if let at = args.firstIndex(of: "--\(name)"), at + 1 < args.count { return args[at + 1] }
  return fallback
}

func version(_ name: String) -> AsrModelVersion {
  switch name {
  case "v2": return .v2
  case "ultra": return .ultra
  case "redux": return .redux
  case "phonon2": return .phonon2
  case "phonon25": return .phonon25
  case "bark3": return .bark3
  case "bark3clean": return .bark3Clean
  default: return .v3
  }
}

func units(_ name: String) -> MLComputeUnits? {
  switch name {
  case "ane": return .cpuAndNeuralEngine
  case "gpu": return .cpuAndGPU
  case "cpu": return .cpuOnly
  case "all": return .all
  default: return nil
  }
}

/// The words whose first token starts inside the segment, when the audio ran past it.
func kept(_ timings: [TokenTiming], from: Double, to: Double) -> String {
  var words: [[TokenTiming]] = []
  for timing in timings {
    // The library gives a word's first token a leading space or its ▁.
    if timing.token.hasPrefix("\u{2581}") || timing.token.hasPrefix(" ") || words.isEmpty {
      words.append([timing])
    } else {
      words[words.count - 1].append(timing)
    }
  }
  return
    words
    .filter { $0[0].startTime >= from && $0[0].startTime < to }
    .map {
      $0.map(\.token).joined().replacingOccurrences(of: "\u{2581}", with: "")
        .trimmingCharacters(in: .whitespaces)
    }
    .joined(separator: " ")
}

/// Does a segment hold speech? Silero at the threshold in one 256 ms chunk.
func holdsSpeech(_ vad: VadManager, _ wav: String, _ threshold: Float) async throws -> Bool {
  let results = try await vad.process(URL(fileURLWithPath: wav))
  return results.contains { $0.probability >= threshold }
}

@main
struct Engine {
  static func main() async {
    do {
      // `--vad-models <dir>`: Silero on Core ML reads each segment first, and a
      // segment with no speech comes back empty. With `--vad-only` nothing else
      // runs: the answer is "speech" or nothing, for `--vad-gate`.
      let threshold = Float(flag("vad-threshold", "0.5")) ?? 0.5
      let vadModels = flag("vad-models", "")
      let vad: VadManager? =
        vadModels.isEmpty
        ? nil
        : try await VadManager(
          config: VadConfig(defaultThreshold: threshold),
          modelDirectory: URL(fileURLWithPath: vadModels, isDirectory: true))
      if CommandLine.arguments.contains("--vad-only"), let vad {
        say(["ready": true])
        while let line = readLine() {
          guard let data = line.data(using: .utf8),
            let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let id = request["id"], let wav = request["wav"] as? String
          else { continue }
          do {
            if CommandLine.arguments.contains("--vad-stats") {
              let results = try await vad.process(URL(fileURLWithPath: wav))
              say(["id": id, "text": results.map { String(format: "%.2f", $0.probability) }.joined(separator: " ")])
              continue
            }
            let speech = try await holdsSpeech(vad, wav, threshold)
            say(["id": id, "text": speech ? "speech" : ""])
          } catch {
            say(["id": id, "error": "\(error)"])
          }
        }
        return
      }
      let chosen = version(flag("version", "v3"))
      let directory = URL(fileURLWithPath: flag("models", ""), isDirectory: true)
      let models = try await AsrModels.downloadAndLoad(
        to: directory, version: chosen, encoderComputeUnits: units(flag("units", "default")))
      let manager = AsrManager(config: .default)
      try await manager.loadModels(models)
      let wholeDir = flag("whole-dir", "")
      if !wholeDir.isEmpty {
        let out = flag("out-dir", ".")
        try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        for name in try FileManager.default.contentsOfDirectory(atPath: wholeDir).sorted()
        where name.hasSuffix(".wav") {
          let began = Date()
          var state = TdtDecoderState.make(decoderLayers: await manager.decoderLayerCount)
          let result = try await manager.transcribe(
            URL(fileURLWithPath: "\(wholeDir)/\(name)"), decoderState: &state)
          var segments: [[String: Any]] = []
          var open: [TokenTiming] = []
          func close() {
            guard let first = open.first, let last = open.last else { return }
            segments.append([
              "start": first.startTime, "end": last.endTime,
              "text": open.map(\.token).joined().replacingOccurrences(of: "\u{2581}", with: " ")
                .trimmingCharacters(in: .whitespaces),
            ])
            open = []
          }
          for timing in result.tokenTimings ?? [] {
            open.append(timing)
            let t = timing.token
            if t.hasSuffix(".") || t.hasSuffix("?") || t.hasSuffix("!") { close() }
          }
          close()
          let meeting = String(name.dropLast(4))
          let data = try JSONSerialization.data(withJSONObject: [
            "meeting": meeting, "seconds": Date().timeIntervalSince(began), "segments": segments,
            "text": result.text,
          ])
          try data.write(to: URL(fileURLWithPath: "\(out)/\(meeting).json"))
          say(["meeting": meeting, "segments": segments.count, "seconds": Date().timeIntervalSince(began)])
        }
        return
      }
      say(["ready": true])
      while let line = readLine() {
        guard let data = line.data(using: .utf8),
          let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = request["id"], let wav = request["wav"] as? String
        else { continue }
        do {
          if let vad, try await !holdsSpeech(vad, wav, threshold) {
            say(["id": id, "text": ""])
            continue
          }
          var state = TdtDecoderState.make(decoderLayers: await manager.decoderLayerCount)
          let result = try await manager.transcribe(
            URL(fileURLWithPath: wav), decoderState: &state)
          if let from = request["keepFrom"] as? Double, let to = request["keepTo"] as? Double {
            say(["id": id, "text": kept(result.tokenTimings ?? [], from: from, to: to)])
          } else {
            say(["id": id, "text": result.text])
          }
        } catch {
          say(["id": id, "error": "\(error)"])
        }
      }
    } catch {
      FileHandle.standardError.write(Data("fluid-engine: \(error)\n".utf8))
      exit(1)
    }
  }
}
