"""Citation Nexus — local HTTP bridge.

Listens on 127.0.0.1:3002 (configurable). Exposes a tiny JSON API used by the
extension and by external agents (Hermes, Claude, curl, ...).

Design constraints:
- localhost only; never bind 0.0.0.0.
- No auth, but bound to loopback so network exposure is impossible.
- Fail-soft: external HTTP calls (arXiv, CrossRef, ...) are best-effort.
"""

from __future__ import annotations

from nexus_bridge.server import run

__all__ = ["run"]
