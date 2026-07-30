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

struct UnavailableVoiceGateway: VoiceGateway {
    func submit(turnID: UUID, audioURL: URL) async throws -> AsyncStream<VoiceGatewayEvent> {
        throw GatewayUnavailable.missingConfiguration
    }
    enum GatewayUnavailable: Error { case missingConfiguration }
}
