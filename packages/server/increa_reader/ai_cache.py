"""
LRU cache for AI responses (summary, tags, ask)
"""

import time
from collections import OrderedDict
from threading import Lock
from typing import Any, Dict, Optional, Tuple

# Global cache instance
_cache: OrderedDict[str, Tuple[Any, float]] = OrderedDict()
_cache_lock = Lock()

# Default: cache up to 128 entries, expire after 30 minutes
MAX_CACHE_SIZE = 128
DEFAULT_TTL = 1800  # seconds


def _make_key(prefix: str, repo: str, path: str, extra: str = "") -> str:
    """Create a cache key from prefix, repo, path, and optional extra info."""
    parts = [prefix, repo, path]
    if extra:
        parts.append(extra)
    return ":".join(parts)


def get_cached(key: str, ttl: float = DEFAULT_TTL) -> Optional[Any]:
    """Get a cached value if it exists and hasn't expired."""
    with _cache_lock:
        if key not in _cache:
            return None
        value, timestamp = _cache[key]
        if time.time() - timestamp > ttl:
            del _cache[key]
            return None
        # Move to end (most recently used)
        _cache.move_to_end(key)
        return value


def set_cached(key: str, value: Any) -> None:
    """Store a value in cache, evicting oldest if at capacity."""
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
        _cache[key] = (value, time.time())
        # Evict oldest entries if over capacity
        while len(_cache) > MAX_CACHE_SIZE:
            _cache.popitem(last=False)


def invalidate(key: str) -> None:
    """Remove a specific key from cache."""
    with _cache_lock:
        _cache.pop(key, None)


def invalidate_prefix(prefix: str) -> int:
    """Remove all keys starting with the given prefix. Returns count removed."""
    with _cache_lock:
        keys_to_remove = [k for k in _cache if k.startswith(prefix)]
        for k in keys_to_remove:
            del _cache[k]
        return len(keys_to_remove)


def clear_cache() -> None:
    """Clear the entire cache."""
    with _cache_lock:
        _cache.clear()


def cache_stats() -> Dict[str, Any]:
    """Return cache statistics."""
    with _cache_lock:
        now = time.time()
        active = sum(1 for _, (_, ts) in _cache.items() if now - ts <= DEFAULT_TTL)
        return {
            "total_entries": len(_cache),
            "active_entries": active,
            "max_size": MAX_CACHE_SIZE,
        }