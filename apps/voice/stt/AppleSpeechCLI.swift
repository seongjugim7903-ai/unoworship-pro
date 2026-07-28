// 우노워십 음성 모듈 — Apple Speech(온디바이스) 스트리밍 STT CLI
//
// 마이크 입력을 받아 인식 결과를 JSON Lines 로 stdout 에 흘린다.
// Node 쪽 어댑터(src/stt/appleSpeech.js)가 이 출력을 파싱해 Detector 에 먹인다.
//
// 출력 형식
//   {"type":"ready","locale":"ko-KR","onDevice":true,"hints":66}
//   {"type":"partial","t":12.34,"audioEnd":12.10,"text":"요한복음 십삼장"}
//   {"type":"final","t":13.01,"audioEnd":12.88,"text":"요한복음 13장 31절을 보시겠습니다"}
//   {"type":"error","message":"..."}
//
//   t        = 오디오 시작 이후 경과(초, 벽시계)
//   audioEnd = 인식된 마지막 음절이 끝난 오디오 시각(초)
//   지연 ≈ t - audioEnd  → PLAN 12절 "STT 부분결과" 예산 실측에 쓴다
//
// 사용
//   unoworship-stt [--locale ko-KR] [--hints <파일>] [--allow-server]
//     --hints        어휘 힌트 파일(한 줄에 하나). 66권 책이름을 넣어 인식률을 올린다.
//     --allow-server 온디바이스 모델이 없을 때 서버 인식 허용(기본: 온디바이스 전용)

import Foundation
import Speech
import AVFoundation
import AppKit
import CoreAudio

// ── 입력 장치 선택 ──────────────────────────────────────────────────────
// 운영 중인 맥의 시스템 기본 입력(예: BlackHole 가상 장치)을 건드리지 않고
// 이 앱만 특정 장치(믹서 M32, ATEM 등)를 직접 듣게 한다.

/// 입력 채널이 있는 오디오 장치 목록
func inputDevices() -> [(id: AudioDeviceID, name: String, channels: Int)] {
  var addr = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDevices,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain)

  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size) == noErr else { return [] }
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids) == noErr else { return [] }

  var found: [(AudioDeviceID, String, Int)] = []
  for id in ids {
    var streamAddr = AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyStreamConfiguration,
      mScope: kAudioDevicePropertyScopeInput,
      mElement: kAudioObjectPropertyElementMain)
    var streamSize: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(id, &streamAddr, 0, nil, &streamSize) == noErr, streamSize > 0 else { continue }

    let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(streamSize), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(id, &streamAddr, 0, nil, &streamSize, raw) == noErr else { continue }

    var channels = 0
    for buffer in UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self)) {
      channels += Int(buffer.mNumberChannels)
    }
    guard channels > 0 else { continue }

    var nameAddr = AudioObjectPropertyAddress(
      mSelector: kAudioObjectPropertyName,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain)
    var cfName: CFString = "" as CFString
    var nameSize = UInt32(MemoryLayout<CFString>.size)
    guard AudioObjectGetPropertyData(id, &nameAddr, 0, nil, &nameSize, &cfName) == noErr else { continue }

    found.append((id, cfName as String, channels))
  }
  return found
}

// ── 출력 ────────────────────────────────────────────────────────────────
// stdout 또는 --out 파일. 파일 모드가 필요한 이유:
//   macOS TCC 는 셸에서 직접 spawn 한 프로세스의 음성인식 접근을 부모에게 귀속시켜 거부한다
//   (SIGABRT). LaunchServices(`open`)로 띄워야 하는데 그때는 stdout 이 연결되지 않는다.
//   그래서 결과를 파일로 흘리고 Node 가 읽는다. 이 파일은 블랙박스 로그(PLAN 11절)도 겸한다.
let outLock = NSLock()
var outHandle: FileHandle? = nil

func emit(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
        let line = String(data: data, encoding: .utf8) else { return }
  outLock.lock()
  if let h = outHandle {
    h.write((line + "\n").data(using: .utf8)!)
  } else {
    print(line)
    fflush(stdout)
  }
  outLock.unlock()
}

func fail(_ message: String) -> Never {
  emit(["type": "error", "message": message])
  exit(1)
}

// ── 인자 파싱 ───────────────────────────────────────────────────────────
var locale = "ko-KR"
var hintsPath: String? = nil
var outPath: String? = nil
var allowServer = false
var deviceMatch: String? = nil
var listDevices = false

var argIndex = 1
let args = CommandLine.arguments
while argIndex < args.count {
  switch args[argIndex] {
  case "--locale":
    argIndex += 1
    if argIndex < args.count { locale = args[argIndex] }
  case "--hints":
    argIndex += 1
    if argIndex < args.count { hintsPath = args[argIndex] }
  case "--out":
    argIndex += 1
    if argIndex < args.count { outPath = args[argIndex] }
  case "--device":
    argIndex += 1
    if argIndex < args.count { deviceMatch = args[argIndex] }
  case "--list-devices":
    listDevices = true
  case "--allow-server":
    allowServer = true
  default:
    break
  }
  argIndex += 1
}

// 출력 파일 준비 — 첫 emit(오류 포함)보다 먼저 열어야 진단 메시지가 남는다.
if let path = outPath {
  FileManager.default.createFile(atPath: path, contents: nil)
  outHandle = FileHandle(forWritingAtPath: path)
}

// 장치 목록만 찍고 끝 (--list-devices)
if listDevices {
  for d in inputDevices() {
    emit(["type": "device", "id": Int(d.id), "name": d.name, "channels": d.channels])
  }
  exit(0)
}

var hints: [String] = []
if let path = hintsPath, let text = try? String(contentsOfFile: path, encoding: .utf8) {
  hints = text.split(separator: "\n")
    .map { $0.trimmingCharacters(in: .whitespaces) }
    .filter { !$0.isEmpty }
}

// ── 인식기 준비 ─────────────────────────────────────────────────────────
guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) else {
  fail("이 시스템에서 \(locale) 음성 인식을 지원하지 않습니다.")
}
guard recognizer.isAvailable else {
  fail("음성 인식기를 지금 사용할 수 없습니다. 시스템 설정 > 받아쓰기에서 \(locale) 를 켜고 다시 시도하세요.")
}

let engine = AVAudioEngine()
var request: SFSpeechAudioBufferRecognitionRequest?
var task: SFSpeechRecognitionTask?
// 오디오 엔진이 실제로 열린 시각. 프로세스 시작 시각으로 재면 권한 확인·엔진 기동에 걸린
// 시간(실측 3.8초)이 지연으로 잘못 잡힌다. 엔진 start 직후에 다시 찍는다.
var startedAt = Date()
// 태스크는 길게 두면 끊기므로 재시작한다. 재시작해도 오디오 시각이 이어지도록 누적 오프셋을 둔다.
var audioOffset: Double = 0
var lastAudioEnd: Double = 0
// 지금까지 마이크에서 받아 넘긴 오디오 총량(초). 부분결과는 애플이 구간 타임스탬프를
// 채우지 않아(전부 0) 이 값을 대신 쓴다 — 감지기에 단조 증가하는 시각을 주고
// 지연(= 벽시계 - 오디오 위치)도 이걸로 계산한다.
var audioFed: Double = 0
let stateLock = NSLock()

func elapsed() -> Double { Date().timeIntervalSince(startedAt) }

/// 인식 태스크 시작 (오디오 엔진은 계속 돌아가고 태스크만 갈아끼운다)
func startTask() {
  stateLock.lock()
  defer { stateLock.unlock() }

  let req = SFSpeechAudioBufferRecognitionRequest()
  req.shouldReportPartialResults = true
  if recognizer.supportsOnDeviceRecognition {
    req.requiresOnDeviceRecognition = !allowServer ? true : false
  } else if !allowServer {
    fail("온디바이스 \(locale) 모델이 없습니다. 시스템 설정 > 키보드 > 받아쓰기에서 언어를 추가하거나 --allow-server 로 실행하세요.")
  }
  if !hints.isEmpty { req.contextualStrings = hints }
  request = req

  task = recognizer.recognitionTask(with: req) { result, error in
    if let result = result {
      let segs = result.bestTranscription.segments
      let segEnd = segs.last.map { $0.timestamp + $0.duration } ?? 0
      stateLock.lock()
      // 구간 타임스탬프가 있으면(주로 final) 그걸 쓰고, 없으면(부분결과) 지금까지 넣은 오디오 양을 쓴다.
      let audioEnd = segEnd > 0 ? segEnd + audioOffset : audioFed
      lastAudioEnd = max(lastAudioEnd, audioEnd)
      let fed = audioFed
      stateLock.unlock()
      emit([
        "type": result.isFinal ? "final" : "partial",
        "t": round(elapsed() * 1000) / 1000,
        "audioEnd": round(audioEnd * 1000) / 1000,
        "audioFed": round(fed * 1000) / 1000,
        "segTimed": segEnd > 0,
        "text": result.bestTranscription.formattedString,
      ])
      if result.isFinal { restartTask() }
      return
    }
    if let error = error {
      let ns = error as NSError

      // 받아쓰기가 꺼져 있으면 몇 번을 재시도해도 같은 실패다. 폭주하지 않고 즉시 멈춘다.
      if ns.domain == "kLSRErrorDomain" && ns.code == 201 {
        fail("시스템 받아쓰기가 꺼져 있습니다. 시스템 설정 > 키보드 > 받아쓰기를 켜고 한국어를 추가한 뒤 다시 실행하세요.")
      }

      // 무음이 길면 태스크가 스스로 끝난다 — 오류가 아니라 정상 흐름이므로 조용히 재시작한다.
      let benign = ns.domain == "kAFAssistantErrorDomain" || ns.code == 216 || ns.code == 301
      if !benign {
        emit(["type": "error", "message": "\(ns.domain)(\(ns.code)) \(ns.localizedDescription)"])
      }
      restartTask()
    }
  }
}

var restarting = false
/// 태스크를 정리하고 새로 띄운다. 설교 전체(40분+)를 끊김 없이 받기 위한 핵심.
func restartTask() {
  stateLock.lock()
  if restarting { stateLock.unlock(); return }
  restarting = true
  audioOffset = lastAudioEnd
  request?.endAudio()
  task?.cancel()
  request = nil
  task = nil
  stateLock.unlock()

  DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
    stateLock.lock(); restarting = false; stateLock.unlock()
    startTask()
  }
}

// ── 권한 → 오디오 시작 ──────────────────────────────────────────────────
SFSpeechRecognizer.requestAuthorization { status in
  DispatchQueue.main.async {
    guard status == .authorized else {
      fail("음성 인식 권한이 없습니다(상태 \(status.rawValue)). 시스템 설정 > 개인정보 보호 및 보안 > 음성 인식에서 터미널을 허용하세요.")
    }

    let input = engine.inputNode

    // 지정 장치가 있으면 이 앱의 입력만 그 장치로 바꾼다 (시스템 기본 입력은 그대로 둔다).
    var selectedDevice = "시스템 기본"
    if let match = deviceMatch {
      let devices = inputDevices()
      guard let hit = devices.first(where: { $0.name.localizedCaseInsensitiveContains(match) }) else {
        let names = devices.map { $0.name }.joined(separator: ", ")
        fail("입력 장치 '\(match)' 를 찾지 못했습니다. 사용 가능: \(names)")
      }
      var deviceID = hit.id
      let status = AudioUnitSetProperty(
        input.audioUnit!,
        kAudioOutputUnitProperty_CurrentDevice,
        kAudioUnitScope_Global,
        0,
        &deviceID,
        UInt32(MemoryLayout<AudioDeviceID>.size))
      guard status == noErr else {
        fail("입력 장치를 '\(hit.name)' 로 바꾸지 못했습니다 (OSStatus \(status)).")
      }
      selectedDevice = "\(hit.name) (\(hit.channels)ch)"
    }

    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0 else {
      fail("오디오 입력 장치를 열지 못했습니다. 시스템 설정 > 사운드 > 입력을 확인하세요.")
    }

    let sampleRate = format.sampleRate
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
      stateLock.lock()
      audioFed += Double(buffer.frameLength) / sampleRate
      let req = request
      stateLock.unlock()
      req?.append(buffer)
    }

    engine.prepare()
    do {
      try engine.start()
    } catch {
      fail("오디오 엔진 시작 실패: \(error.localizedDescription)")
    }
    startedAt = Date()   // 여기가 오디오 t=0 — 지연 계산 기준

    startTask()
    emit([
      "type": "ready",
      "locale": locale,
      "onDevice": recognizer.supportsOnDeviceRecognition && !allowServer,
      "hints": hints.count,
      "sampleRate": format.sampleRate,
      "channels": format.channelCount,
      "device": selectedDevice,
    ])
  }
}

signal(SIGINT) { _ in exit(0) }
signal(SIGTERM) { _ in exit(0) }

// NSApplication 으로 띄운다. 단순 RunLoop 로는 앱이 "실행 중"에 머물러(독에서 계속 튐)
// 권한 허용 창을 표시하지 못한다. .accessory = 독 아이콘·메뉴막대 없는 백그라운드 앱.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.run()
