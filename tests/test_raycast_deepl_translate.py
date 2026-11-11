import os


def test_deepl_endpoint_and_lang_mapping():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tr = open(os.path.join(base, "src", "logic", "translator.ts"), encoding="utf-8").read()
    assert "https://api-free.deepl.com/v2/translate" in tr
    assert "https://api.deepl.com/v2/translate" in tr
    assert "DeepL-Auth-Key" in tr
    assert "detected_source_language" in tr


def test_deepl_byok_preferences_configured():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pref = open(os.path.join(base, "scripts", "preference.ts"), encoding="utf-8").read()
    assert "deeplApiKey" in pref
    assert "DeepL API (BYOK)" in pref
    assert "provider" in pref


def test_deepl_rate_limit_and_auth_error_handling():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tr = open(os.path.join(base, "src", "logic", "translator.ts"), encoding="utf-8").read()
    assert "response.status === 429 || response.status === 456" in tr
    assert "response.status === 403" in tr
