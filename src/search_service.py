import json
from typing import List

import numpy as np
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = FastAPI(title="LinkedIn Connections Search API")


class SearchRequest(BaseModel):
    q: str = Field(..., description="Search query string")
    limit: int = Field(10, ge=1, le=100, description="Maximum number of results")

# Global variables to store data and index
connections = []
vectorizer = None
tfidf_matrix = None


def load_connections(filepath: str = "data/linkedin-connections.jsonl"):
    """Load connections from JSONL file."""
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line))
    return data


def build_tfidf_index(connections_data: List[dict]):
    """Build TF-IDF index using word-level with n-grams and character trigrams."""
    global vectorizer, tfidf_matrix

    # Extract descriptions
    descriptions = [conn.get('description', '') for conn in connections_data]

    # Create TF-IDF vectorizer with word-level unigrams and bigrams
    # This gives better results for phrase matching like "system analyst"
    # while still providing some fuzzy matching capability
    vectorizer = TfidfVectorizer(
        analyzer='char',
        ngram_range=(1, 2),  # Unigrams and bigrams
        lowercase=True,
        min_df=1,
        token_pattern=r'\b\w+\b'  # Match word boundaries
    )

    # Fit and transform descriptions
    tfidf_matrix = vectorizer.fit_transform(descriptions)

    print(f"✅ TF-IDF index built with {len(descriptions)} connections")
    print(f"📊 Vocabulary size: {len(vectorizer.vocabulary_)}")
    print("📝 Using word-level unigrams + bigrams for better phrase matching")


@app.on_event("startup")
async def startup_event():
    """Load data and build index on startup."""
    global connections

    try:
        connections = load_connections('data/linkedin-connections.jsonl')
        print(f"📂 Loaded {len(connections)} connections from data/linkedin-connections.jsonl")

        if connections:
            build_tfidf_index(connections)
        else:
            print("⚠️  No connections found in file")
    except FileNotFoundError:
        print("❌ Error: data/linkedin-connections.jsonl not found")
        print("💡 Run the LinkedIn scraper first: node linkedin-automation.js run")
    except Exception as e:
        print(f"❌ Error loading connections: {e}")


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "LinkedIn Connections Search API",
        "endpoints": {
            "/search": "Search connections by description",
            "/stats": "Get index statistics"
        },
        "total_connections": len(connections)
    }


@app.post("/search")
async def search(request: SearchRequest):
    """
    Search connections using TF-IDF similarity on descriptions.

    Args:
        request: SearchRequest object containing query and limit

    Returns:
        List of matching connections with similarity scores
    """
    if not connections:
        return {"error": "No connections loaded", "results": []}

    if not vectorizer or tfidf_matrix is None:
        return {"error": "Index not built", "results": []}

    # Transform query using the same vectorizer
    query_vector = vectorizer.transform([request.q.lower()])

    # Calculate cosine similarity
    similarities = cosine_similarity(query_vector, tfidf_matrix).flatten()

    # Get top k results
    top_indices = np.argsort(similarities)[::-1][:request.limit]

    # Filter out zero similarity results
    results = []
    for idx in top_indices:
        score = float(similarities[idx])
        if score > 0:
            result = connections[idx].copy()
            result['score'] = score
            results.append(result)

    return {
        "query": request.q,
        "total_results": len(results),
        "results": results
    }


@app.get("/stats")
async def stats():
    """Get statistics about the index."""
    return {
        "total_connections": len(connections),
        "vocabulary_size": len(vectorizer.vocabulary_) if vectorizer else 0,
        "index_built": tfidf_matrix is not None
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
