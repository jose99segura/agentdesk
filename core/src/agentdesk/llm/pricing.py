# USD per million tokens (input, output). Approximate list prices: check each
# provider's pricing page before trusting the cost column for anything real.
PRICES: dict[str, tuple[float, float]] = {
    "mistral-small-latest": (0.10, 0.30),
    "mistral-medium-latest": (0.40, 2.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "offline": (0.0, 0.0),
}


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = PRICES.get(model, (0.0, 0.0))
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000
