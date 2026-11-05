// Apple's on-device speech recognition as a `room-replay.js --engine`.
//
// Reads one JSON line per segment on stdin, {"id":1,"wav":"/path.wav"} with an
// optional "keywords":["word", ...], and answers one line on stdout,
// {"id":1,"text":"..."} or {"id":1,"error":"..."}. The first line it prints is
// {"ready":true}, once the model is on disk and loaded.
//
//   swiftc -O -sdk "$(xcrun --show-sdk-path)" -target arm64-apple-macos26.0 \
//     scripts/engines/speech-analyzer.swift -o speech-analyzer
//   speech-analyzer [--module speech|dictation] [--preset transcription]
//                   [--locale en-US]
//   speech-analyzer --whole-dir <streams> --out-dir <dir>
//
// With --whole-dir it reads each WAV whole, with the model's own segmentation
// and context, and writes <dir>/<name>.json, {"segments":[{start,end,text}]}:
// a pass over a finished conversation. Times are on the file's own clock.
//
// `--module speech` is SpeechTranscriber, the macOS 26 model for long speech
// and conversations. `--module dictation` is DictationTranscriber, the model
// behind SFSpeechRecognizer's on-device mode. Nothing here leaves the Mac: the
// frameworks fetch the model through AssetInventory, the first time only.

import AVFoundation
import Foundation
import Speech

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

func speechModule(_ locale: Locale, _ preset: String) -> SpeechTranscriber {
  switch preset {
  case "progressive": return SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
  case "alternatives":
    return SpeechTranscriber(locale: locale, preset: .transcriptionWithAlternatives)
  default: return SpeechTranscriber(locale: locale, preset: .transcription)
  }
}

func dictationModule(_ locale: Locale, _ preset: String) -> DictationTranscriber {
  switch preset {
  case "short": return DictationTranscriber(locale: locale, preset: .shortDictation)
  case "phrase": return DictationTranscriber(locale: locale, preset: .phrase)
  default: return DictationTranscriber(locale: locale, preset: .longDictation)
  }
}

@main
struct Engine {
  static func main() async {
    do {
      try await run()
    } catch {
      FileHandle.standardError.write(Data("speech-analyzer: \(error)\n".utf8))
      exit(1)
    }
  }

  static func install(_ module: any SpeechModule) async throws {
    let before = await AssetInventory.status(forModules: [module])
    FileHandle.standardError.write(Data("speech-analyzer: asset status \(before)\n".utf8))
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [module]) {
      try await request.downloadAndInstall()
      FileHandle.standardError.write(Data("speech-analyzer: asset installed\n".utf8))
    }
  }

  static func whole(
    _ dir: String, _ out: String, _ locale: Locale, _ options: SpeechAnalyzer.Options
  ) async throws {
    let names = try FileManager.default.contentsOfDirectory(atPath: dir).sorted()
    try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
    for name in names where name.hasSuffix(".wav") {
      let started = Date()
      let file = try AVAudioFile(forReading: URL(fileURLWithPath: "\(dir)/\(name)"))
      let module = SpeechTranscriber(
        locale: locale, transcriptionOptions: [], reportingOptions: [],
        attributeOptions: [.audioTimeRange])
      let analyzer = try await SpeechAnalyzer(
        inputAudioFile: file, modules: [module], options: options, finishAfterFile: true)
      var segments: [[String: Any]] = []
      for try await result in module.results where result.isFinal {
        segments.append([
          "start": result.range.start.seconds,
          "end": result.range.end.seconds,
          "text": String(result.text.characters),
        ])
      }
      _ = analyzer
      let meeting = String(name.dropLast(4))
      let data = try JSONSerialization.data(withJSONObject: [
        "meeting": meeting, "seconds": Date().timeIntervalSince(started), "segments": segments,
      ])
      try data.write(to: URL(fileURLWithPath: "\(out)/\(meeting).json"))
      say(["meeting": meeting, "segments": segments.count, "seconds": Date().timeIntervalSince(started)])
    }
  }

  static func run() async throws {
    let moduleName = flag("module", "speech")
    let preset = flag("preset", "transcription")
    let wanted = Locale(identifier: flag("locale", "en-US"))
    guard SpeechTranscriber.isAvailable else {
      throw NSError(
        domain: "speech-analyzer", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "SpeechTranscriber is not available on this Mac"])
    }
    let options = SpeechAnalyzer.Options(priority: .userInitiated, modelRetention: .processLifetime)
    let locale: Locale
    if moduleName == "dictation" {
      guard let found = await DictationTranscriber.supportedLocale(equivalentTo: wanted) else {
        throw NSError(domain: "speech-analyzer", code: 2)
      }
      locale = found
      try await install(dictationModule(locale, preset))
    } else {
      guard let found = await SpeechTranscriber.supportedLocale(equivalentTo: wanted) else {
        throw NSError(domain: "speech-analyzer", code: 2)
      }
      locale = found
      try await install(speechModule(locale, preset))
    }
    let wholeDir = flag("whole-dir", "")
    if !wholeDir.isEmpty {
      try await whole(wholeDir, flag("out-dir", "."), locale, options)
      return
    }
    say(["ready": true, "locale": locale.identifier])

    while let line = readLine() {
      guard let data = line.data(using: .utf8),
        let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let id = request["id"], let wav = request["wav"] as? String
      else { continue }
      do {
        let file = try AVAudioFile(forReading: URL(fileURLWithPath: wav))
        let context = AnalysisContext()
        if let words = request["keywords"] as? [String], !words.isEmpty {
          context.contextualStrings[.general] = words
        }
        var text = ""
        if moduleName == "dictation" {
          let module = dictationModule(locale, preset)
          let analyzer = try await SpeechAnalyzer(
            inputAudioFile: file, modules: [module], options: options, analysisContext: context,
            finishAfterFile: true)
          for try await result in module.results where result.isFinal {
            text += String(result.text.characters)
          }
          _ = analyzer
        } else {
          let module = speechModule(locale, preset)
          let analyzer = try await SpeechAnalyzer(
            inputAudioFile: file, modules: [module], options: options, analysisContext: context,
            finishAfterFile: true)
          for try await result in module.results where result.isFinal {
            text += String(result.text.characters)
          }
          _ = analyzer
        }
        say(["id": id, "text": text])
      } catch {
        say(["id": id, "error": "\(error)"])
      }
    }
  }
}
