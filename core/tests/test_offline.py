import pytest

from agentdesk.llm.offline import detect_intent, detect_language


@pytest.mark.parametrize("text,lang", [
    ("\nLe mug en grès passe-t-il au lave-vaisselle ?", "fr"),
    ("Hola, ¿dónde está mi pedido ORD-10001?", "es"),
    ("Hi, where is my order ORD-10001?", "en"),
    ("???", "en"),
])
def test_language(text, lang):
    assert detect_language(text) == lang


@pytest.mark.parametrize("text,intent", [
    ("My order arrived broken", "damaged_item"),
    ("Quiero el reembolso del pedido", "refund_request"),
    ("Merci d'annuler la commande", "cancellation"),
    ("Où est ma commande ?", "order_status"),
    ("Bonjour", "other"),
])
def test_intent(text, intent):
    assert detect_intent(text) == intent
