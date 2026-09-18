"""Request-local quality notes, propagated through the API to the download UI."""
from contextvars import ContextVar

_notes: ContextVar[list[str] | None] = ContextVar("conversion_notes", default=None)


def begin_report() -> None:
    _notes.set([])


def note(message: str) -> None:
    notes = _notes.get()
    if notes is not None and message not in notes:
        notes.append(message)


def get_notes() -> list[str]:
    return list(_notes.get() or [])
