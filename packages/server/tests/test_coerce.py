"""Tests for coerce utility — tests the JS coerce logic reimplemented in Python for reference."""


def _coerce(type_name: str, value):
    """Python reimplementation of the frontend coerce logic for testing reference."""
    type_checks = {
        "boolean": lambda v: isinstance(v, bool),
        "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
        "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        "object": lambda v: isinstance(v, dict),
        "array": lambda v: isinstance(v, list),
        "string": lambda v: isinstance(v, str),
    }
    if type_checks.get(type_name, lambda v: False)(value):
        return value
    if type_name == "boolean":
        if isinstance(value, str):
            return value.lower() == "true"
        return bool(value)
    if type_name == "integer":
        if isinstance(value, str):
            return int(value)
        return round(value)
    if type_name == "number":
        if isinstance(value, str):
            return float(value)
        return float(value)
    if type_name in ("object", "array"):
        if isinstance(value, str):
            import json
            try:
                parsed = json.loads(value)
                if type_checks[type_name](parsed):
                    return parsed
            except json.JSONDecodeError:
                pass
    return value


class TestCoerceBoolean:
    def test_passthrough_boolean(self):
        assert _coerce("boolean", True) is True
        assert _coerce("boolean", False) is False

    def test_string_to_boolean(self):
        assert _coerce("boolean", "true") is True
        assert _coerce("boolean", "True") is True
        assert _coerce("boolean", "false") is False
        assert _coerce("boolean", "FALSE") is False


class TestCoerceInteger:
    def test_passthrough_integer(self):
        assert _coerce("integer", 42) == 42

    def test_string_to_integer(self):
        assert _coerce("integer", "42") == 42

    def test_float_to_integer(self):
        assert _coerce("integer", 3.7) == 4


class TestCoerceNumber:
    def test_passthrough_number(self):
        assert _coerce("number", 3.14) == 3.14

    def test_string_to_number(self):
        assert _coerce("number", "3.14") == 3.14


class TestCoerceObject:
    def test_passthrough_object(self):
        assert _coerce("object", {"key": "value"}) == {"key": "value"}

    def test_string_to_object(self):
        assert _coerce("object", '{"key": "value"}') == {"key": "value"}


class TestCoerceArray:
    def test_passthrough_array(self):
        assert _coerce("array", [1, 2, 3]) == [1, 2, 3]

    def test_string_to_array(self):
        assert _coerce("array", "[1, 2, 3]") == [1, 2, 3]