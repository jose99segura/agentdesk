from agentdesk.llm.router import CircuitBreaker, ModelRouter
from agentdesk.llm.types import AllProvidersFailed, Completion, ProviderError


class Sink:
    def __init__(self):
        self.steps = []

    def step(self, kind, name, status, **data):
        self.steps.append((kind, name, status))


class FakeProvider:
    def __init__(self, name, failures=0, transient=True):
        self.name = name
        self.model = name
        self.failures = failures
        self.transient = transient
        self.calls = 0

    def complete(self, messages, tools, force_tool):
        self.calls += 1
        if self.calls <= self.failures:
            raise ProviderError(self.name, "boom", transient=self.transient, status=503)
        return Completion("ok", [], self.name, self.model, 10, 5, 1)


def router(*providers, **kw):
    return ModelRouter(list(providers), sleep=lambda _: None, **kw)


def test_retries_a_transient_error_on_the_same_provider():
    a = FakeProvider("a", failures=1)
    result = router(a).complete([], [], None, Sink())
    assert result.provider == "a" and a.calls == 2


def test_falls_back_when_a_provider_keeps_failing():
    a, b = FakeProvider("a", failures=99), FakeProvider("b")
    sink = Sink()
    result = router(a, b).complete([], [], None, sink)
    assert result.provider == "b"
    assert ("fallback", "a -> b", "ok") in sink.steps


def test_permanent_errors_skip_retries():
    a, b = FakeProvider("a", failures=99, transient=False), FakeProvider("b")
    router(a, b).complete([], [], None, Sink())
    assert a.calls == 1


def test_open_circuit_is_skipped_without_calling_the_provider():
    a, b = FakeProvider("a", failures=99), FakeProvider("b")
    r = router(a, b)
    for _ in range(2):
        r.complete([], [], None, Sink())
    calls = a.calls
    sink = Sink()
    r.complete([], [], None, sink)
    assert a.calls == calls
    assert ("fallback", "skip a", "blocked") in sink.steps


def test_fault_injection_takes_a_provider_down():
    a, b = FakeProvider("a"), FakeProvider("b")
    result = router(a, b, is_faulted=lambda name: name == "a").complete([], [], None, Sink())
    assert result.provider == "b" and a.calls == 0


def test_everything_down_raises():
    a = FakeProvider("a", failures=99)
    try:
        router(a).complete([], [], None, Sink())
    except AllProvidersFailed:
        return
    raise AssertionError("expected AllProvidersFailed")


def test_breaker_half_opens_after_cooldown_and_closes_on_success():
    b = CircuitBreaker(failure_threshold=2, cooldown_s=10)
    b.record_failure("x", now=0)
    b.record_failure("x", now=0)
    assert b.state == "open" and not b.allow(now=5)
    assert b.allow(now=11) and b.state == "half_open"
    b.record_success()
    assert b.state == "closed"


def test_a_failed_probe_reopens_the_circuit():
    b = CircuitBreaker(failure_threshold=2, cooldown_s=10)
    b.record_failure("x", now=0)
    b.record_failure("x", now=0)
    b.allow(now=11)
    b.record_failure("x", now=11)
    assert b.state == "open" and not b.allow(now=12)
