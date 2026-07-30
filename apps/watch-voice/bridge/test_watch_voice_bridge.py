import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import watch_voice_bridge as bridge


class TurnStoreTests(unittest.TestCase):
    def test_reserve_inflight_then_cached_response(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_db = Path(directory) / "turns.sqlite3"
            with patch.object(bridge, "STATE_DB", state_db):
                bridge.initialize_turn_store()
                turn_id = uuid.uuid4()
                self.assertEqual(bridge.reserve_turn(turn_id), ("reserved", None, None))
                self.assertEqual(bridge.reserve_turn(turn_id), ("inflight", None, None))
                payload = {"turnID": str(turn_id), "receipts": ["capture", "dispatch", "accept", "work", "deliver"]}
                bridge.finish_turn(turn_id, 200, payload)
                self.assertEqual(bridge.reserve_turn(turn_id), ("cached", 200, payload))
                self.assertEqual(os.stat(state_db).st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
