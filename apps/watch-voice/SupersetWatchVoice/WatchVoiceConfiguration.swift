import Foundation
import Security

struct WatchVoiceConfiguration: Sendable {
    let baseURL: URL
    let bearerToken: String

    static func load() throws -> Self {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "WatchVoiceBaseURL") as? String,
              let url = URL(string: raw), url.scheme == "https" || url.host == "127.0.0.1" else {
            throw ConfigurationError.invalidEndpoint
        }
        let token: String
#if DEBUG
        if let debugToken = ProcessInfo.processInfo.environment["WATCH_VOICE_TOKEN"], !debugToken.isEmpty {
            token = debugToken
        } else {
            token = try loadKeychainToken()
        }
#else
        token = try loadKeychainToken()
#endif
        return Self(baseURL: url, bearerToken: token)
    }

    private static func loadKeychainToken() throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.superset.watchvoice",
            kSecAttrAccount as String: "watch-scoped-token",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            throw ConfigurationError.missingCredential
        }
        return token
    }

    enum ConfigurationError: Error { case invalidEndpoint, missingCredential }
}
