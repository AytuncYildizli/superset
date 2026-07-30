import Foundation

struct HTTPSVoiceGateway: VoiceGateway {
    let configuration: WatchVoiceConfiguration
    let session: URLSession

    init(configuration: WatchVoiceConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
    }

    func submit(turnID: UUID, audioURL: URL) async throws -> AsyncStream<VoiceGatewayEvent> {
        var request = URLRequest(url: configuration.baseURL.appending(path: "v1/watch/turns"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(configuration.bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("audio/mp4", forHTTPHeaderField: "Content-Type")
        request.setValue(turnID.uuidString, forHTTPHeaderField: "X-Turn-ID")
        request.setValue(turnID.uuidString, forHTTPHeaderField: "Idempotency-Key")
        request.httpBody = try Data(contentsOf: audioURL, options: .mappedIfSafe)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw GatewayError.transport }
        let envelope = try JSONDecoder().decode(TurnEnvelope.self, from: data)
        guard UUID(uuidString: envelope.turnID) == turnID,
              envelope.receipts == ReceiptLeg.allCases.map(\.rawValue) else { throw GatewayError.invalidReceipt }
        return AsyncStream { continuation in
            continuation.yield(.dispatched)
            continuation.yield(.accepted)
            continuation.yield(.working)
            continuation.yield(.final(VoiceReply(text: envelope.finalText)))
            continuation.finish()
        }
    }

    struct TurnEnvelope: Decodable { let turnID: String; let finalText: String; let receipts: [String] }
    enum GatewayError: Error { case transport, invalidReceipt }
}
