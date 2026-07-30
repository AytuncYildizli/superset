import AVFoundation
import Foundation

@MainActor
final class WatchAudioRecorder {
    private var recorder: AVAudioRecorder?
    func start() async throws -> URL {
#if DEBUG
        if let fixture = ProcessInfo.processInfo.environment["WATCH_VOICE_FIXTURE_NAME"],
           let url = Bundle.main.url(forResource: fixture, withExtension: nil) {
            return url
        }
#endif
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else { throw RecorderError.permissionDenied }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("watch-turn-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [AVFormatIDKey: Int(kAudioFormatMPEG4AAC), AVSampleRateKey: 16_000, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 32_000]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder.prepareToRecord()
        guard recorder.record() else { throw RecorderError.startFailed }
        self.recorder = recorder
        return url
    }
    func stop() { recorder?.stop(); recorder = nil }
    enum RecorderError: Error { case permissionDenied, startFailed }
}
