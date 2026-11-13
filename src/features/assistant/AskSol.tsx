import { ExternalLink, Keyboard, MessagesSquare, Mic, SendHorizontal, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { DailyCheckin, DemoScenario, RiskAssessment } from '../../contracts';
import type { MoodMcqAnswers } from '../checkin/moodAssessment';
import { KnowledgeIndex } from './knowledge';
import { MOOD_QUESTIONS, moodReply } from './mood';
import { respond, type AssistantContext, type AssistantReply } from './respond';
import { VoiceMode } from './VoiceMode';
import './askSol.css';

type Message =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; reply: AssistantReply };

const STARTERS = ['How am I doing today?', 'What happened on Sol 41?', 'Why does CO2 cause headaches?', 'Start a mood check'];

export function AskSol({ scenario, records, latest, assessment }: {
  scenario: DemoScenario; records: readonly DailyCheckin[]; latest: DailyCheckin | null; assessment: RiskAssessment | null;
}) {
  const index = useMemo(() => new KnowledgeIndex(), []);
  const ctx: AssistantContext = useMemo(() => ({
    crewName: scenario.profile.displayName,
    sol: latest?.sol ?? scenario.startSol,
    oneWayDelayMinutes: scenario.missionContext.oneWayDelayMinutes,
    latest, assessment, history: records,
  }), [scenario, latest, assessment, records]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [speak, setSpeak] = useState(false);
  const [mood, setMood] = useState<{ step: number; answers: MoodMcqAnswers } | null>(null);
  const nextId = useRef(1);
  const logEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, mood]);
  useEffect(() => { if (typing) input.current?.focus(); }, [typing]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function addExchange(question: string, reply: AssistantReply) {
    setMessages((list) => [...list, { id: nextId.current++, role: 'user', text: question }, { id: nextId.current++, role: 'assistant', reply }]);
  }

  function say(text: string) {
    if (!speak || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setDraft('');
    const reply = respond(text, ctx, index);
    addExchange(text, reply);
    say(reply.text);
    if (reply.kind === 'mood_start') setMood({ step: 0, answers: {} });
    else if (reply.kind === 'crisis') setMood(null);
  }

  function answerMood(score: number, label: string) {
    if (!mood) return;
    const answers = { ...mood.answers, [MOOD_QUESTIONS[mood.step].id]: score };
    if (mood.step + 1 < MOOD_QUESTIONS.length) {
      setMessages((list) => [...list, { id: nextId.current++, role: 'user', text: label }]);
      setMood({ step: mood.step + 1, answers });
    } else {
      setMood(null);
      const reply = moodReply(answers);
      addExchange(label, reply);
      say(reply.text);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(draft);
  }

  const lastReply = [...messages].reverse().find((m): m is Extract<Message, { role: 'assistant' }> => m.role === 'assistant')?.reply;
  const suggestions = mood ? [] : lastReply?.suggestions ?? (messages.length === 0 ? STARTERS : []);
  const question = mood ? MOOD_QUESTIONS[mood.step] : null;

  return (
    <div className="ask-sol">
      <header className="page-intro">
        <h1><MessagesSquare size={26} aria-hidden="true" /> Ask Sol</h1>
        <p className="page-subtitle">Talk to Sol about your health check-in, the mission and the NASA research behind Sol Check.</p>
        <p className="ask-sol-rules"><ShieldCheck size={16} aria-hidden="true" /> Answers come only from Sol Check’s cited information and your own check-in, on this device. Not a diagnosis, and no medicine advice.</p>
      </header>

      <section className="panel ask-sol-talk" aria-labelledby="ask-talk-title">
        <button type="button" className="ask-talk-button" onClick={() => setVoiceOpen(true)} aria-describedby="ask-talk-hint">
          <span className="ask-talk-orb" aria-hidden="true"><Mic size={34} /></span>
          <span id="ask-talk-title" className="ask-talk-label">Talk to Sol</span>
        </button>
        <p id="ask-talk-hint" className="ask-talk-hint">Hands-free: just speak, Sol answers out loud. Your browser will ask to use the microphone. Speech is turned into text on this device; the first time, a voice model (about 60 MB) downloads once.</p>
        {!typing && <button type="button" className="text-link ask-type-toggle" onClick={() => setTyping(true)}><Keyboard size={16} aria-hidden="true" /> Type instead</button>}
      </section>

      {(typing || messages.length > 0) && (
        <section className="panel ask-sol-chat" aria-label="Conversation with Ask Sol">
          {messages.length > 0 && (
            <ol className="ask-sol-log" aria-live="polite">
              {messages.map((message) => message.role === 'user' ? (
                <li key={message.id} className="ask-msg ask-msg-user"><p>{message.text}</p></li>
              ) : (
                <li key={message.id} className={`ask-msg ask-msg-sol kind-${message.reply.kind}`}>
                  <p>{message.reply.text}</p>
                  {message.reply.sources.length > 0 && (
                    <ul className="ask-sources" aria-label="Where this answer comes from">
                      {message.reply.sources.map((source, i) => (
                        <li key={`${source.label}-${i}`}>
                          {source.url
                            ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} <ExternalLink size={12} aria-hidden="true" /></a>
                            : source.route ? <Link to={source.route}>{source.label}</Link> : <span>{source.label}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {question && (
                <li className="ask-msg ask-msg-sol ask-mood">
                  <p><strong>{question.number} of {MOOD_QUESTIONS.length} · {question.title}</strong><br />{question.prompt}</p>
                  <div className="ask-mood-options">
                    {question.options.map((option) => (
                      <button key={option.score} type="button" className="button button-secondary" onClick={() => answerMood(option.score, option.label)}>{option.label}</button>
                    ))}
                  </div>
                  <button type="button" className="text-link" onClick={() => setMood(null)}>Stop the mood check</button>
                </li>
              )}
              <div ref={logEnd} />
            </ol>
          )}

          {typing && suggestions.length > 0 && (
            <div className="ask-suggestions" aria-label="Suggested questions">
              {suggestions.map((s) => <button key={s} type="button" className="button button-sm button-secondary" onClick={() => ask(s)}>{s}</button>)}
            </div>
          )}

          {typing && (
            <form className="ask-input" onSubmit={submit}>
              <label htmlFor="ask-draft" className="sr-only">Your question</label>
              <input id="ask-draft" ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about your health or the mission" autoComplete="off" disabled={Boolean(mood)} />
              <button type="button" className="button button-secondary ask-icon-btn" onClick={() => { setSpeak((v) => !v); window.speechSynthesis?.cancel(); }}
                aria-pressed={speak} aria-label={speak ? 'Stop reading answers aloud' : 'Read answers aloud'} title={speak ? 'Reading answers aloud' : 'Read answers aloud'}>
                {speak ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
              </button>
              <button type="submit" className="button button-primary" disabled={!draft.trim() || Boolean(mood)}><SendHorizontal size={18} aria-hidden="true" /> Ask</button>
            </form>
          )}
        </section>
      )}

      {voiceOpen && (
        <VoiceMode
          ctx={ctx}
          index={index}
          onExchange={addExchange}
          onClose={(typeInstead) => { setVoiceOpen(false); if (typeInstead) setTyping(true); }}
        />
      )}
    </div>
  );
}
