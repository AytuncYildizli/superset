# Superset Watch Voice

Native SwiftUI watchOS push-to-talk client backed by a local authenticated voice bridge.

## Real turn path

1. Watch records AAC/16 kHz mono audio.
2. `HTTPSVoiceGateway` posts `audio/mp4` to `/v1/watch/turns` with a scoped bearer token, UUID turn ID, and idempotency key.
3. The local bridge uses Hermes' configured auto-language STT.
4. Yapitalism proves dispatch and acceptance in an isolated Superset terminal.
5. A bounded Hermes one-shot (`web` toolset only, no external side effects) returns concise text.
6. Watch renders all five receipts and speaks the answer with `AVSpeechSynthesizer`.

No bearer token is committed. Debug simulator injection uses process environment; release builds read `watch-scoped-token` from Keychain service `com.superset.watchvoice`.

## Local bridge

```bash
python3 bridge/bootstrap_superset_lane.py
WATCH_VOICE_TOKEN="$(security find-generic-password -w -s com.superset.watchvoice -a watch-scoped-token)" \
  python3 bridge/watch_voice_bridge.py
```

The bridge binds only to `127.0.0.1:18787` by default. Physical Watch requires a TLS-reachable bridge URL and token provisioning; do not expose this HTTP dev listener to LAN/WAN.

## Verification receipts

- Xcode simulator build and unit tests: `receipts/real-bridge-build.log`, `receipts/real-bridge-test.log`
- App-level real bridge E2E screenshot: `receipts/real-bridge-simulator-green.png`
- The E2E fixture is compiled only as a DEBUG harness selected by `WATCH_VOICE_FIXTURE_NAME`; release behavior always uses the microphone.

## Remaining physical-device gates

- Apple Development signing/provisioning and install on Aytunc's paired Watch.
- Keychain token provisioning or iPhone companion pairing flow.
- TLS endpoint reachable from Watch over Wi-Fi/LTE.
- Physical microphone, speaker route, network transition, and battery/thermal soak.

Rollback: stop the local bridge, remove the Watch app, and delete the isolated `Superset Watch Voice` local workspace in Superset. Existing user terminals are not touched.
