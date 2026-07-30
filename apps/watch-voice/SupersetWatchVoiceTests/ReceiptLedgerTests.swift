import Testing
@testable import SupersetWatchVoice

@Test func ledgerRequiresOrderedFiveLegCompletion() {
    var ledger = ReceiptLedger()
    ledger.mark(.deliver)
    #expect(ledger.completed.isEmpty)
    for leg in ReceiptLeg.allCases { ledger.mark(leg) }
    #expect(ledger.isComplete)
    ledger.mark(.deliver)
    #expect(ledger.completed.count == 5)
}
