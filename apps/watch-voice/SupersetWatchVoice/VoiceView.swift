import SwiftUI
import WatchKit

struct VoiceView: View {
    @StateObject private var model = VoiceSessionModel()
    var body: some View {
        VStack(spacing: 10) {
            Text("SUPERSET VOICE").font(.caption2).foregroundStyle(.secondary)
            Text(model.reply).font(.headline).multilineTextAlignment(.center).lineLimit(3)
            Circle().fill(model.phase == .listening ? AnyShapeStyle(.red) : AnyShapeStyle(.purple.gradient)).frame(width: 76, height: 76)
                .overlay(Image(systemName: model.phase == .listening ? "waveform" : "mic.fill").font(.title))
                .onLongPressGesture(minimumDuration: 0, maximumDistance: 60, pressing: { pressed in
                    if pressed { model.startListening(); WKInterfaceDevice.current().play(.start) } else { model.finishListening() }
                }, perform: {})
            HStack(spacing: 4) { ForEach(ReceiptLeg.allCases, id: \.self) { leg in Circle().fill(model.ledger.completed.contains(leg) ? .green : .gray.opacity(0.35)).frame(width: 7, height: 7) } }
        }.padding()
    }
}
