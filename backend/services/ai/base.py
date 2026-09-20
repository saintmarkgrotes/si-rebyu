from abc import ABC, abstractmethod


class AIProvider(ABC):
    """The only thing the rest of the app knows about an AI vendor. Add a provider = add one subclass."""

    @abstractmethod
    async def generate_json(self, system: str, prompt: str, max_output_tokens: int = 8192) -> str:
        """Send one request and return the model's raw text (expected to be JSON).

        Must raise the AI*Error classes from services.errors, never vendor-specific exceptions.
        """
