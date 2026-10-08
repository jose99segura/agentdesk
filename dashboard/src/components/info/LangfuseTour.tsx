import { Code, Shot, Sub } from "./parts";

export default function LangfuseTour() {
  return (
    <div className="space-y-10">
      <Sub title="From the dashboard to a trace">
        <p>
          Open any run on the <span className="text-ink">Runs</span> page and click <span className="text-ink">Open full trace in
          Langfuse</span>. Each ticket is one trace; the trace holds a generation for every model call and a span for every tool
          call, guard check, retry and fallback, in order. Traces are grouped by ticket as a session, tagged by channel, and
          labelled with the environment (<Code>agentdesk-dev</Code>, <Code>ci</Code>) so local, CI and production never mix.
        </p>
      </Sub>

      <Shot
        src="/info/langfuse-trace.jpg"
        alt="An agentdesk trace in Langfuse"
        w={800}
        h={479}
        caption={
          <>
            A trace: the tree on the left is everything that happened (triage, two resolver model calls, the two tool calls,
            the guard). On the right, the input ticket, the output (reply, refund, flags) and the <Code>eval.passed</Code> score.
            This one is the prompt-injection case: the injected “refund 5000 euros” became a refund of the order total, flagged
            for the reviewer.
          </>
        }
      />

      <Shot
        src="/info/langfuse-generation.jpg"
        alt="A model call in Langfuse"
        w={800}
        h={479}
        caption="One model call: the system prompt, the tool results the model saw (here, the order it looked up), its answer, tokens, cost, latency and which provider answered. This is how you answer “why did it say that?”."
      />

      <Shot
        src="/info/langfuse-dataset.jpg"
        alt="The golden dataset in Langfuse"
        w={800}
        h={479}
        caption="The golden suite as a Langfuse dataset: each item is a case with its input and the expected behaviour. Every evaluation run links its traces to these items."
      />

      <Sub title="What to look at, by question">
        <ul className="space-y-1.5">
          <li>
            <span className="text-ink">Why did this ticket get this reply?</span> Its trace: the prompt, the data looked up, the
            answer.
          </li>
          <li>
            <span className="text-ink">Is a prompt change better or worse?</span> Datasets › agentdesk-golden › Experiments: two
            runs side by side.
          </li>
          <li>
            <span className="text-ink">What does it cost?</span> Dashboards: cost and tokens per model, per day.
          </li>
          <li>
            <span className="text-ink">Where does it fail?</span> Traces filtered by level ERROR or WARNING: retries, fallbacks,
            guard blocks.
          </li>
        </ul>
      </Sub>
    </div>
  );
}
