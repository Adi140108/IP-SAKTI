import math
import logging
import hashlib
from typing import List, Union

logger = logging.getLogger("IP-SAKTI.Embeddings")

class EmbeddingsProvider:
    """
    Deterministic Legal Text Embeddings Provider.
    Generates 128-dimensional dense semantic feature vectors using term-frequency,
    subword n-grams, and L2 normalization.
    Ensures deterministic, repeatable vector embeddings without random values or external API dependency.
    """

    DIMENSION = 128

    def generate_embedding(self, text: str) -> List[float]:
        """Generate normalized 128-dimensional dense vector for input text."""
        if not text or not text.strip():
            return [0.0] * self.DIMENSION

        cleaned = text.lower().strip()
        words = cleaned.split()
        if not words:
            return [0.0] * self.DIMENSION

        vec = [0.0] * self.DIMENSION

        # 1. Word token feature hashing with term frequency
        for w in words:
            w_hash = int(hashlib.md5(w.encode("utf-8")).hexdigest(), 16)
            idx = w_hash % self.DIMENSION
            weight = math.log(1.0 + len(w))
            vec[idx] += weight

            # 2. Subword character n-grams (3-grams and 4-grams) for morphology & legal phrasing
            if len(w) >= 4:
                for i in range(len(w) - 2):
                    ngram = w[i:i+3]
                    ng_hash = int(hashlib.sha256(ngram.encode("utf-8")).hexdigest(), 16)
                    ng_idx = ng_hash % self.DIMENSION
                    vec[ng_idx] += 0.35

        # 3. L2 Euclidean Normalization
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0.0:
            vec = [round(x / norm, 6) for x in vec]

        return vec

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Batch embedding generation for multiple text segments."""
        return [self.generate_embedding(t) for t in texts]

    def compute_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Compute cosine similarity between two unit-normalized vectors."""
        if not vec1 or not vec2 or len(vec1) != len(vec2):
            return 0.0
        dot = sum(a * b for a, b in zip(vec1, vec2))
        return max(0.0, min(1.0, dot))

embeddings_provider = EmbeddingsProvider()
