import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _production_settings(**overrides):
    values = {
        "ENVIRONMENT": "production",
        "DEBUG": False,
        "SECRET_KEY": "app-secret-" + "a" * 48,
        "SUPABASE_JWT_SECRET": "jwt-secret-" + "b" * 48,
        "TICKET_SIGNING_PRIVATE_KEY": "c" * 64,
        "ALLOWED_ORIGINS": ["https://shopnojatra.com"],
        "BKASH_WEBHOOK_SECRET": "bkash-secret-" + "1" * 40,
        "NAGAD_WEBHOOK_SECRET": "nagad-secret-" + "2" * 40,
        "ROCKET_WEBHOOK_SECRET": "rocket-secret-" + "3" * 40,
        "STRIPE_WEBHOOK_SECRET": "stripe-secret-" + "4" * 40,
        "CARD_WEBHOOK_SECRET": "card-secret-" + "5" * 40,
    }
    values.update(overrides)
    return values


def test_production_accepts_distinct_strong_webhook_secrets():
    settings = Settings(**_production_settings())

    assert settings.ENVIRONMENT == "production"


@pytest.mark.parametrize(
    "overrides",
    [
        {"BKASH_WEBHOOK_SECRET": "short-secret"},
        {"CARD_WEBHOOK_SECRET": "bkash-secret-" + "1" * 40},
        {"STRIPE_WEBHOOK_SECRET": "whsec_mock_stripe_webhook_secret"},
    ],
)
def test_production_rejects_weak_or_reused_webhook_secrets(overrides):
    with pytest.raises(ValidationError, match="SECURITY FAULT"):
        Settings(**_production_settings(**overrides))
