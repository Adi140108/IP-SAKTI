import math
import logging
from typing import List

logger = logging.getLogger("IP-SAKTI.Embeddings")

class EmbeddingsProvider:
    """
    Embeddings Provider generating vector representations for legal text chunks.
    Provides deterministic TF-IDF / term-frequency vector embedding for local/memory vector store,
    with interface support forSentenceTransformers or external embedding APIs.
    """

    def generate_embedding(self, text: str) -> List[float]:
        """Generate normalized term-vector representation for text."""
        words = text.lower().split()
        if not words:
            return [0.0] * 64

        # Generate a 64-dimensional feature vector hash mapping
        vec = [0.0] * 64
        for w in words:
            idx = sum(ord(c) for c in w) % 64
            vec[idx] += 1.0

        # Cosine normalization
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    def compute_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Compute cosine similarity between two feature vectors."""
        if len(vec1) != len(vec2):
            return 0.0
        dot = sum(a * b for a, b in zip(vec1, vec2))
        return max(0.0, min(1.0, dot))

embeddings_provider = EmbeddingsProvider()
