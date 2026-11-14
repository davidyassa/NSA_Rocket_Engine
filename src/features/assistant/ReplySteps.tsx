import type { AssistantReply } from './respond';

/** An emergency reply on screen: the alert line, the numbered steps to do now, and what to say next. */
export function ReplySteps({ reply, className = '' }: { reply: AssistantReply; className?: string }) {
  const steps = reply.steps ?? [];
  const start = reply.stepStart ?? 1;
  const first = reply.text.indexOf(`Step ${start}:`);
  const last = steps.length ? reply.text.lastIndexOf(steps[steps.length - 1]) : -1;
  const lead = first > 0 ? reply.text.slice(0, first).trim() : '';
  const tail = last >= 0 ? reply.text.slice(last + steps[steps.length - 1].length).trim() : '';
  return (
    <div className={`reply-steps ${className}`.trim()} role="group" aria-label="Emergency steps">
      <span className="sr-only">Sol said </span>
      {lead && <p className="reply-steps-lead">{lead}</p>}
      <ol start={start}>
        {steps.map((step, i) => <li key={`${start + i}`}>{step}</li>)}
      </ol>
      {tail && <p className="reply-steps-tail">{tail}</p>}
    </div>
  );
}
