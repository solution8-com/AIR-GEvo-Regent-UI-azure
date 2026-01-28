import importlib
import os

import pytest


def _load_app(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "n8n")
    monkeypatch.setenv("AZURE_OPENAI_MODEL", "test-model")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://dummy.openai.azure.com")
    import app as app_module
    return importlib.reload(app_module)


def test_get_n8n_session_id_prefers_conversation(monkeypatch):
    app_module = _load_app(monkeypatch)
    request_body = {
        "history_metadata": {"conversation_id": "conv-123"},
        "messages": [{"role": "user", "id": "msg-1"}],
    }
    assert app_module._get_n8n_session_id(request_body, {}) == "conv-123"


def test_get_n8n_session_id_uses_user_message_id(monkeypatch):
    app_module = _load_app(monkeypatch)
    request_body = {"messages": [{"role": "user", "id": "msg-abc"}]}
    assert app_module._get_n8n_session_id(request_body, {}) == "msg-abc"


def test_get_n8n_chat_input_from_text_list(monkeypatch):
    app_module = _load_app(monkeypatch)
    request_body = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "hello"},
                    {"type": "image_url", "image_url": {"url": "https://example.com"}},
                ],
            }
        ]
    }
    assert app_module._get_n8n_chat_input(request_body) == "hello"


def test_extract_n8n_output_nested(monkeypatch):
    app_module = _load_app(monkeypatch)
    payload = {"json": {"output": "response text"}}
    assert app_module._extract_n8n_output(payload) == "response text"


def test_format_n8n_response_shape(monkeypatch):
    app_module = _load_app(monkeypatch)
    response = app_module._format_n8n_response(
        "hi",
        {"conversation_id": "conv"},
        "resp-id",
        123,
        False,
    )
    assert response["id"] == "resp-id"
    assert response["choices"][0]["messages"][0]["content"] == "hi"
    assert response["history_metadata"]["conversation_id"] == "conv"


def test_aoai_settings_skips_endpoint_when_n8n(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "n8n")
    monkeypatch.setenv("AZURE_OPENAI_MODEL", "test-model")
    monkeypatch.delenv("AZURE_OPENAI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_RESOURCE", raising=False)
    from backend.settings import _AzureOpenAISettings
    _AzureOpenAISettings()


def test_aoai_settings_requires_endpoint_for_aoai(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "aoai")
    monkeypatch.delenv("AZURE_OPENAI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_RESOURCE", raising=False)
    with pytest.raises(ValueError):
        from backend.settings import _AzureOpenAISettings
        _AzureOpenAISettings(model="test-model", endpoint=None, resource=None)
