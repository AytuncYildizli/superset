import Combine
import Foundation

@MainActor
final class VoiceSessionModel: ObservableObject {
    @Published private(set) var phase: VoicePhase = .idle
    @Published private(set) var reply = "Hold to talk"
    @Published private(set) var ledger = ReceiptLedger()
    private let recorder = WatchAudioRecorder()
    private let gateway: any VoiceGateway
    private var audioURL: URL?
    init(gateway: any VoiceGateway = MockVoiceGateway()) { self.gateway = gateway }
    func startListening() {
        guard phase == .idle || phase == .delivered || phase == .failed else { return }
        ledger = ReceiptLedger(); reply = "Listening…"; phase = .listening
        Task { do { audioURL = try await recorder.start() } catch { phase = .failed; reply = "Microphone unavailable" } }
    }
    func finishListening() {
        guard phase == .listening, let audioURL else { return }
        recorder.stop(); ledger.mark(.capture); phase = .sending; reply = "Sending…"
        Task { await submit(audioURL: audioURL) }
    }
    private func submit(audioURL: URL) async {
        do {
            for await event in try await gateway.submit(turnID: UUID(), audioURL: audioURL) {
                switch event {
                case .dispatched: ledger.mark(.dispatch)
                case .accepted: ledger.mark(.accept); phase = .accepted; reply = "Accepted"
                case .working: ledger.mark(.work); phase = .working; reply = "Thinking…"
                case .final(let response): ledger.mark(.deliver); phase = .delivered; reply = response.text
                }
            }
        } catch { phase = .failed; reply = "Turn failed — tap to retry" }
    }
}
