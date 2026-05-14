from __future__ import annotations

import json

import httpx
import pytest

from spaghetti.ollama_client import OllamaClient, OllamaError


def _client_with_handler(handler) -> OllamaClient:
    client = OllamaClient()
    # Replace the live client with a MockTransport-backed one, keeping the base_url.
    base_url = client.base_url
    client._client._transport = httpx.MockTransport(handler)
    client._client.base_url = httpx.URL(base_url)
    return client


@pytest.mark.asyncio
async def test_list_models_parses_payload() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(
            200,
            json={"models": [{"name": "llama3.2", "size": 123}, {"name": "gemma3"}]},
        )

    client = _client_with_handler(handler)
    try:
        models = await client.list_models()
    finally:
        await client.aclose()

    assert [m.name for m in models] == ["llama3.2", "gemma3"]
    assert models[0].size == 123
    assert models[1].size is None


@pytest.mark.asyncio
async def test_list_models_raises_on_connection_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope", request=request)

    client = _client_with_handler(handler)
    try:
        with pytest.raises(OllamaError):
            await client.list_models()
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_chat_stream_yields_content_chunks() -> None:
    lines = [
        json.dumps({"message": {"content": "Hello"}, "done": False}),
        json.dumps({"message": {"content": ", world"}, "done": False}),
        json.dumps({"message": {"content": "."}, "done": True}),
    ]
    body = ("\n".join(lines) + "\n").encode()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/chat"
        return httpx.Response(200, content=body)

    client = _client_with_handler(handler)
    try:
        chunks = [
            chunk
            async for chunk in client.chat_stream(
                model="llama3.2",
                messages=[{"role": "user", "content": "hi"}],
            )
        ]
    finally:
        await client.aclose()

    assert "".join(chunks) == "Hello, world."
