import Foundation

enum VoicePhase: String, Sendable { case idle, listening, sending, accepted, working, delivered, failed }
enum ReceiptLeg: String, CaseIterable, Codable, Sendable { case capture, dispatch, accept, work, deliver }

struct ReceiptLedger: Equatable, Sendable {
    private(set) var completed: [ReceiptLeg] = []
    mutating func mark(_ leg: ReceiptLeg) {
        guard completed.count < ReceiptLeg.allCases.count, leg == ReceiptLeg.allCases[completed.count] else { return }
        completed.append(leg)
    }
    var isComplete: Bool { completed == ReceiptLeg.allCases }
}

struct VoiceReply: Sendable { let text: String }
enum VoiceGatewayEvent: Sendable { case dispatched, accepted, working, final(VoiceReply) }
protocol VoiceGateway: Sendable { func submit(turnID: UUID, audioURL: URL) async throws -> AsyncStream<VoiceGatewayEvent> }

struct MockVoiceGateway: VoiceGateway {
    func submit(turnID: UUID, audioURL: URL) async throws -> AsyncStream<VoiceGatewayEvent> {
        AsyncStream { continuation in
            Task {
                continuation.yield(.dispatched); try? await Task.sleep(for: .milliseconds(220))
                continuation.yield(.accepted); try? await Task.sleep(for: .milliseconds(280))
                continuation.yield(.working); try? await Task.sleep(for: .milliseconds(450))
                continuation.yield(.final(VoiceReply(text: "Watch voice turn delivered.")))
                continuation.finish()
            }
        }
    }
}
