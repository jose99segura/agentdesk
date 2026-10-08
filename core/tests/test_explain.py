"""The explainer answers from the guide, offline, and is wired like the other agents."""

from agentdesk.explain import MARKER, best_section, offline_answer, sections, system_prompt
from agentdesk.llm.offline import EXPLAINER_MARKER, OfflineProvider
from agentdesk.llm.types import Message


def test_guide_has_sections():
    titles = [s.title for s in sections()]
    assert "What it is" in titles
    assert "How errors are handled" in titles
    assert all(s.body for s in sections())


def test_retrieval_finds_the_section():
    assert best_section("What happens when a model provider is down?").title == "How errors are handled"
    assert best_section("How are the evaluations run in CI?").title == "Evaluations"
    # Both sections describe a provider outage; either is a right quote.
    assert best_section("¿Qué pasa cuando se cae un modelo?").title in (
        "How errors are handled", "Every path a ticket can take")
    assert best_section("Qué workflows hay en n8n").title == "n8n: the edges"


def test_offline_provider_answers_in_prose():
    assert EXPLAINER_MARKER == MARKER
    provider = OfflineProvider(seed=1)
    messages = [Message("system", system_prompt(None)), Message("user", "How is a refund approved?")]
    completion = provider.complete(messages, [], None)
    assert completion.tool_calls == []
    assert completion.text == offline_answer("How is a refund approved?")
    assert "approval" in completion.text.lower()


def test_system_prompt_without_live_facts_is_a_template():
    prompt = system_prompt(None)
    assert prompt.startswith(MARKER)
    assert "{live facts}" in prompt
    assert "## Guide" not in prompt  # the guide is embedded, not referenced
