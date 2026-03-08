import threading
from typing import Dict, List, Optional


class YjsDocumentStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._updates: Dict[str, List[bytes]] = {}

    def apply_update(self, doc_id: str, update: bytes) -> None:
        with self._lock:
            if doc_id not in self._updates:
                self._updates[doc_id] = []
            self._updates[doc_id].append(update)

    def get_state(self, doc_id: str) -> Optional[bytes]:
        with self._lock:
            updates = self._updates.get(doc_id)
            if not updates:
                return None
            return b"".join(updates)

    def clear(self, doc_id: str) -> None:
        with self._lock:
            self._updates.pop(doc_id, None)

    def active_documents(self) -> List[str]:
        with self._lock:
            return list(self._updates.keys())
