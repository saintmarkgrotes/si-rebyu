class DocumentError(Exception):
    """A problem with an uploaded document. The message is safe to show to the user."""


class AIError(Exception):
    """Base class for AI provider problems. Messages are safe to show to the user."""


class AIConfigError(AIError):
    """Bad or missing API key / model / provider setting. Retrying won't help."""


class AIQuotaError(AIError):
    """The provider's daily quota is used up. Retrying today won't help."""


class AIRateLimitError(AIError):
    """Too many requests per minute. Waiting and retrying usually works."""

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class AITransientError(AIError):
    """A temporary provider or network problem. Retrying may work."""


class AIBlockedError(AIError):
    """The provider refused to process this content (safety filter)."""


class GenerationError(Exception):
    """Study-material generation failed. The message is safe to show to the user."""
