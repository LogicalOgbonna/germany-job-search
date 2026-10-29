"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Mic,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";

const stages = ["talent", "technical", "assessment", "final", "other"] as const;
type Stage = (typeof stages)[number];
const stageLabels: Record<Stage, string> = {
  talent: "Talent screen",
  technical: "Technical",
  assessment: "Assessment",
  final: "Final",
  other: "General",
};
type Feedback = {
  structure: string;
  specificity: string;
  evidence: string;
  length: string;
  unsupported: { claim: string; checked: string }[];
  rating: number;
};
type Measures = {
  words: number;
  wordsPerMinute: number;
  fillerWords: Record<string, number>;
  seconds: number;
};
type Summary = {
  wentWell: string[];
  improve: string[];
  ratings: { question: string; rating: number }[];
};
type Turn = {
  question: string;
  followUp: boolean;
  transcript: string;
  feedback: Feedback | null;
  measures: Measures | null;
};
type Past = {
  id: string;
  stage?: string;
  startedAt: string;
  endedAt: string | null;
  turns: number;
  summary: Summary | null;
};

// The browser's speech recognition, typed locally: only Chrome and Edge ship it.
type RecognitionResult = { isFinal: boolean; 0?: { transcript: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognizerClass = new () => Recognizer;
function recognizerClass(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognizerClass;
    webkitSpeechRecognition?: RecognizerClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const synthesis = () =>
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;

const mutedKey = "jobdesk.practice.muted";
const langKey = "jobdesk.practice.lang";
const languages = [
  ["en-GB", "English (UK)"],
  ["en-US", "English (US)"],
  ["de-DE", "German"],
] as const;

const speechErrors: Record<string, string> = {
  "not-allowed":
    "Microphone access was blocked. Allow the microphone for this site in Chrome's address bar, then press Start answering again, or type your answer.",
  "service-not-allowed":
    "Chrome did not allow speech recognition here. You can type your answer instead.",
  "audio-capture":
    "No microphone was found. Connect one and try again, or type your answer.",
  network:
    "Speech recognition lost its connection. Check the transcript below, or type your answer.",
  "language-not-supported":
    "Chrome cannot recognise speech in that language. Choose another language or type your answer.",
};

async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

const join = (...parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong";

function FeedbackCard({ turn, number }: { turn: Turn; number: number }) {
  const f = turn.feedback;
  const fillers = Object.entries(turn.measures?.fillerWords ?? {});
  return (
    <article className="card referral-box" aria-label={`Feedback ${number}`}>
      <div className="referral-heading">
        <div>
          <p className="eyebrow">
            {turn.followUp ? "FOLLOW-UP" : `QUESTION ${number}`}
          </p>
          <h4>{turn.question}</h4>
        </div>
        {f && (
          <span
            className={`tag ${f.rating >= 4 ? "positive" : f.rating <= 2 ? "warning" : "subtle"}`}
          >
            {f.rating} of 5
          </span>
        )}
      </div>
      {turn.measures && (
        <div className="referral-stats">
          <span>
            <strong>{turn.measures.words}</strong> words
          </span>
          {turn.measures.seconds > 0 ? (
            <>
              <span>
                <strong>{clock(turn.measures.seconds)}</strong> spoken
              </span>
              <span>
                <strong>{turn.measures.wordsPerMinute}</strong> words per minute
              </span>
            </>
          ) : (
            <span>Typed, not timed</span>
          )}
          <span>
            Filler words:{" "}
            {fillers.length
              ? fillers.map(([word, count]) => `${word} ${count}`).join(", ")
              : "none"}
          </span>
        </div>
      )}
      <details>
        <summary>Your answer</summary>
        <p className="referral-source">{turn.transcript}</p>
      </details>
      {f && (
        <div className="markdown">
          <p>
            <strong>Structure.</strong> {f.structure}
          </p>
          <p>
            <strong>Specificity.</strong> {f.specificity}
          </p>
          <p>
            <strong>Evidence.</strong> {f.evidence}
          </p>
          <p>
            <strong>Length.</strong> {f.length}
          </p>
        </div>
      )}
      {f && f.unsupported.length > 0 && (
        <div className="referral-warning" role="note">
          <strong>Not supported by your experience files</strong>
          <ul>
            {f.unsupported.map((item, i) => (
              <li key={i}>
                {item.claim}. Checked: {item.checked}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  if (!summary.ratings.length)
    return (
      <p className="muted">
        No answers were given in this session, so there is no summary.
      </p>
    );
  return (
    <div className="markdown">
      {summary.wentWell.length > 0 && (
        <>
          <h3>What went well</h3>
          <ul>
            {summary.wentWell.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <h3>Three things to improve</h3>
      <ol>
        {summary.improve.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
      <h3>Rating per question</h3>
      <ul>
        {summary.ratings.map((item, i) => (
          <li key={i}>
            {item.question} <strong>{item.rating} of 5</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Practice({ interviewId }: { interviewId: string }) {
  const [speech, setSpeech] = useState<"checking" | "yes" | "no">("checking"),
    [muted, setMuted] = useState(false),
    [lang, setLang] = useState("en-GB"),
    [planned, setPlanned] = useState<5 | 10>(5),
    [stage, setStage] = useState<Stage | "">(""),
    [interviewStage, setInterviewStage] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null),
    [turns, setTurns] = useState<Turn[]>([]),
    [current, setCurrent] = useState<{
      question: string;
      followUp: boolean;
    } | null>(null),
    [answering, setAnswering] = useState<"idle" | "listening" | "editing">(
      "idle",
    ),
    [draft, setDraft] = useState(""),
    [live, setLive] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [spokenSeconds, setSpokenSeconds] = useState(0),
    [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"" | "start" | "send" | "finish">(""),
    [error, setError] = useState(""),
    [micError, setMicError] = useState(""),
    [past, setPast] = useState<Past[] | null>(null),
    [pastError, setPastError] = useState("");

  const recognizer = useRef<Recognizer | null>(null);
  const open = useRef(false); // the answer is open: restart recognition when it stops
  const committed = useRef(""); // text from earlier recognition runs of this answer
  const runFinal = useRef("");
  const runInterim = useRef("");
  const startedAt = useRef(0);
  const stoppedAt = useRef(0);
  const finalizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef = useRef(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const mounted = useRef(true);

  const loadPast = useCallback(async () => {
    try {
      const data = await api(`/api/interviews/${interviewId}`);
      if (!mounted.current) return;
      setPast(Array.isArray(data?.practice) ? data.practice : []);
      if (typeof data?.interview?.stage === "string")
        setInterviewStage(data.interview.stage);
      setPastError("");
    } catch {
      if (mounted.current)
        setPastError("Past practice sessions could not be loaded.");
    }
  }, [interviewId]);

  useEffect(() => {
    mounted.current = true;
    setSpeech(recognizerClass() ? "yes" : "no");
    try {
      const savedMute = window.localStorage.getItem(mutedKey) === "1";
      mutedRef.current = savedMute;
      setMuted(savedMute);
      const savedLang = window.localStorage.getItem(langKey);
      if (savedLang && languages.some(([code]) => code === savedLang))
        setLang(savedLang);
    } catch {}
    const synth = synthesis();
    const pick = () => {
      const voices = synth?.getVoices() ?? [];
      voice.current =
        voices.find((v) => v.lang === "en-GB") ??
        voices.find((v) => v.lang === "en-US") ??
        voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ??
        null;
    };
    pick();
    synth?.addEventListener?.("voiceschanged", pick);
    void loadPast();
    return () => {
      mounted.current = false;
      open.current = false;
      synth?.removeEventListener?.("voiceschanged", pick);
      synth?.cancel();
      if (finalizeTimer.current) clearTimeout(finalizeTimer.current);
      try {
        recognizer.current?.abort();
      } catch {}
      recognizer.current = null;
    };
  }, [loadPast]);

  useEffect(() => {
    if (answering !== "listening") return;
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [answering]);

  const speak = (text: string) => {
    const synth = synthesis();
    if (!synth || mutedRef.current) return;
    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice.current) {
        utterance.voice = voice.current;
        utterance.lang = voice.current.lang;
      } else utterance.lang = "en-GB";
      synth.speak(utterance);
    } catch {}
  };

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    if (next) synthesis()?.cancel();
    try {
      window.localStorage.setItem(mutedKey, next ? "1" : "0");
    } catch {}
  };

  const changeLang = (value: string) => {
    setLang(value);
    try {
      window.localStorage.setItem(langKey, value);
    } catch {}
  };

  // Ends listening and puts everything heard into the editable transcript.
  const finalize = () => {
    if (finalizeTimer.current) clearTimeout(finalizeTimer.current);
    finalizeTimer.current = null;
    const text = join(committed.current, runFinal.current, runInterim.current);
    committed.current = text;
    runFinal.current = "";
    runInterim.current = "";
    recognizer.current = null;
    if (!mounted.current) return;
    const end = stoppedAt.current || Date.now();
    setSpokenSeconds(
      text ? Math.max(1, Math.round((end - startedAt.current) / 1000)) : 0,
    );
    setDraft(text);
    setLive("");
    setAnswering("editing");
  };

  const stopRecognizer = (abort = false) => {
    open.current = false;
    const rec = recognizer.current;
    if (!rec) return;
    try {
      if (abort) rec.abort();
      else rec.stop();
    } catch {}
  };

  const startListening = () => {
    const Recognition = recognizerClass();
    if (!Recognition) {
      setSpeech("no");
      setAnswering("editing");
      return;
    }
    synthesis()?.cancel(); // so the microphone does not hear the question
    setMicError("");
    committed.current = "";
    runFinal.current = "";
    runInterim.current = "";
    setLive("");
    setDraft("");
    setElapsed(0);
    startedAt.current = Date.now();
    stoppedAt.current = 0;
    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let final = "",
        interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) final += ` ${text}`;
        else interim += ` ${text}`;
      }
      runFinal.current = final;
      runInterim.current = interim;
      setLive(join(committed.current, final, interim));
    };
    rec.onerror = (event) => {
      const text = speechErrors[event.error];
      // "no-speech" and "aborted" are normal pauses; the answer stays open.
      if (text) {
        open.current = false;
        setMicError(text);
      }
    };
    rec.onend = () => {
      committed.current = join(
        committed.current,
        runFinal.current,
        runInterim.current,
      );
      runFinal.current = "";
      runInterim.current = "";
      if (open.current && recognizer.current === rec) {
        try {
          rec.start();
          return;
        } catch {
          open.current = false;
        }
      }
      if (recognizer.current === rec) finalize();
    };
    recognizer.current = rec;
    open.current = true;
    try {
      rec.start();
      setAnswering("listening");
    } catch {
      open.current = false;
      recognizer.current = null;
      setMicError(
        "Speech recognition could not start. You can type your answer instead.",
      );
      setAnswering("editing");
    }
  };

  const done = () => {
    stoppedAt.current = Date.now();
    stopRecognizer();
    // Chrome normally fires "end" right away; do not wait for it forever.
    finalizeTimer.current = setTimeout(() => {
      if (recognizer.current) {
        stopRecognizer(true);
        finalize();
      }
    }, 2000);
  };

  const typeInstead = () => {
    if (answering === "listening") {
      done();
      return;
    }
    setSpokenSeconds(0);
    setAnswering("editing");
  };

  const ask = (next: { question: string; followUp: boolean }) => {
    setCurrent(next);
    setDraft("");
    setLive("");
    setElapsed(0);
    setSpokenSeconds(0);
    setMicError("");
    setAnswering(recognizerClass() ? "idle" : "editing");
    speak(next.question);
  };

  const start = async () => {
    setBusy("start");
    setError("");
    setSummary(null);
    setTurns([]);
    try {
      const data: { sessionId: string; question: string } = await api(
        "/api/practice",
        "POST",
        { interviewId, questions: planned, ...(stage ? { stage } : {}) },
      );
      setSessionId(data.sessionId);
      ask({ question: data.question, followUp: false });
      void loadPast();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  };

  const finish = async (id = sessionId) => {
    if (!id) return;
    if (id === sessionId) {
      stopRecognizer(true);
      recognizer.current = null;
      synthesis()?.cancel();
      setAnswering("idle");
    }
    setBusy("finish");
    setError("");
    try {
      const data: { summary: Summary } = await api(
        `/api/practice/${id}`,
        "POST",
        { action: "finish" },
      );
      if (id === sessionId) {
        setSummary(data.summary);
        setCurrent(null);
      }
      await loadPast();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  };

  const send = async () => {
    if (!sessionId || !current || !draft.trim()) return;
    setBusy("send");
    setError("");
    try {
      const data: {
        feedback: Feedback | null;
        next: { question: string; followUp: boolean } | null;
        measures?: Measures;
      } = await api(`/api/practice/${sessionId}`, "POST", {
        action: "answer",
        transcript: draft.trim(),
        seconds: spokenSeconds,
      });
      setTurns((list) => [
        ...list,
        {
          ...current,
          transcript: draft.trim(),
          feedback: data.feedback,
          measures: data.measures ?? null,
        },
      ]);
      if (data.next) ask(data.next);
      else {
        setCurrent(null);
        setBusy("");
        await finish(sessionId);
        return;
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy((value) => (value === "send" ? "" : value));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this practice session and its transcripts?"))
      return;
    setError("");
    try {
      await api(`/api/practice/${id}`, "DELETE");
      if (id === sessionId) reset();
      await loadPast();
    } catch (e) {
      setError(message(e));
    }
  };

  const reset = () => {
    stopRecognizer(true);
    recognizer.current = null;
    synthesis()?.cancel();
    setSessionId(null);
    setTurns([]);
    setCurrent(null);
    setSummary(null);
    setDraft("");
    setLive("");
    setAnswering("idle");
  };

  const active = Boolean(sessionId && !summary);
  const questionNumber = turns.filter((t) => !t.followUp).length + 1;
  const defaultStage = stages.includes(interviewStage as Stage)
    ? stageLabels[interviewStage as Stage]
    : "";

  return (
    <section className="referral-panel" aria-label="Practice interview">
      <div>
        <h3>Practice out loud</h3>
        <p className="muted">
          Claude plays the interviewer for this round and gives feedback after
          each answer. While you speak, Chrome sends your voice to Google for
          transcription. Transcripts, the prep sheet and your experience files
          go to the Claude API. Jobdesk does not record or upload audio.
        </p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {speech === "no" && (
        <p className="referral-notice" role="status">
          Speech is available in Chrome. You can type your answers here.
        </p>
      )}

      {!sessionId && (
        <div className="card referral-box">
          <div className="field-pair">
            <label className="field">
              Questions
              <select
                value={planned}
                onChange={(e) => setPlanned(e.target.value === "10" ? 10 : 5)}
              >
                <option value={5}>5 questions</option>
                <option value={10}>10 questions</option>
              </select>
            </label>
            <label className="field">
              Interviewer
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage | "")}
              >
                <option value="">
                  This interview&apos;s stage
                  {defaultStage ? ` (${defaultStage})` : ""}
                </option>
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {stageLabels[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {speech === "yes" && (
            <label className="field">
              Answer language
              <select value={lang} onChange={(e) => changeLang(e.target.value)}>
                {languages.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="referral-actions">
            <button
              className="primary"
              disabled={busy !== ""}
              onClick={() => void start()}
            >
              {busy === "start" ? "Starting…" : "Start practice"}
            </button>
            <button
              className="secondary"
              onClick={toggleMute}
              aria-pressed={muted}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {muted ? "Voice off" : "Voice on"}
            </button>
          </div>
        </div>
      )}

      {turns.map((turn, i) => (
        <FeedbackCard
          key={i}
          turn={turn}
          number={turns.slice(0, i + 1).filter((t) => !t.followUp).length}
        />
      ))}

      {active && current && (
        <div className="card referral-box" aria-live="polite">
          <div className="referral-heading">
            <div>
              <p className="eyebrow">
                {current.followUp
                  ? "FOLLOW-UP"
                  : `QUESTION ${questionNumber} OF ${planned}`}
              </p>
              <h4>{current.question}</h4>
            </div>
            <div className="referral-actions">
              <button
                className="text-button"
                onClick={() => speak(current.question)}
                disabled={muted || answering === "listening"}
                aria-label="Hear the question again"
              >
                <Volume2 size={14} /> Hear again
              </button>
              <button
                className="text-button"
                onClick={toggleMute}
                aria-pressed={muted}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {muted ? "Voice off" : "Voice on"}
              </button>
            </div>
          </div>

          {micError && (
            <div className="error-banner" role="alert">
              {micError}
            </div>
          )}

          {answering === "idle" && (
            <div className="referral-actions">
              <button
                className="primary"
                onClick={startListening}
                disabled={busy !== ""}
              >
                <Mic size={14} /> Start answering
              </button>
              <button className="secondary" onClick={typeInstead}>
                <Keyboard size={14} /> Type instead
              </button>
            </div>
          )}

          {answering === "listening" && (
            <>
              <div className="referral-stats" role="timer">
                <span>
                  <strong>{clock(elapsed)}</strong> listening
                </span>
              </div>
              <p className="referral-source" aria-live="polite">
                {live || "Listening… start speaking."}
              </p>
              <div className="referral-actions">
                <button className="primary" onClick={done}>
                  <Square size={14} /> Done
                </button>
                <button className="secondary" onClick={typeInstead}>
                  <Keyboard size={14} /> Type instead
                </button>
              </div>
            </>
          )}

          {answering === "editing" && (
            <>
              <label className="field">
                {spokenSeconds > 0
                  ? `Your answer (${clock(spokenSeconds)} spoken). Fix any transcription mistakes before sending.`
                  : "Your answer"}
                <textarea
                  rows={7}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your answer as you would say it."
                />
              </label>
              <div className="referral-actions">
                <button
                  className="primary"
                  disabled={busy !== "" || !draft.trim()}
                  onClick={() => void send()}
                >
                  {busy === "send" ? "Getting feedback…" : "Send answer"}
                </button>
                {speech === "yes" && (
                  <button
                    className="secondary"
                    onClick={startListening}
                    disabled={busy !== ""}
                  >
                    <RotateCcw size={14} /> Answer aloud again
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {active && (
        <div className="referral-actions">
          <button
            className="secondary"
            disabled={busy !== ""}
            onClick={() => void finish()}
          >
            {busy === "finish" ? "Summarising…" : "End session"}
          </button>
        </div>
      )}

      {summary && (
        <div className="card referral-box" aria-label="Session summary">
          <h4>Session summary</h4>
          <SummaryCard summary={summary} />
          <div className="referral-actions">
            <button className="primary" onClick={reset}>
              Practise again
            </button>
          </div>
        </div>
      )}

      <div className="card referral-box">
        <h4>Past sessions</h4>
        {pastError && <p className="muted">{pastError}</p>}
        {!pastError && past === null && <p className="muted">Loading…</p>}
        {past !== null && past.length === 0 && (
          <p className="muted">No practice sessions yet.</p>
        )}
        {past?.map((item) => {
          const ratings = item.summary?.ratings ?? [];
          const average = ratings.length
            ? (
                ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
              ).toFixed(1)
            : null;
          const inProgress = !item.endedAt;
          return (
            <details key={item.id}>
              <summary>
                {new Date(item.startedAt).toLocaleString()} ·{" "}
                {item.stage && stages.includes(item.stage as Stage)
                  ? `${stageLabels[item.stage as Stage]} · `
                  : ""}
                {item.turns} {item.turns === 1 ? "question" : "questions"}
                {average ? ` · average ${average} of 5` : ""}
                {inProgress
                  ? item.id === sessionId
                    ? " · in progress"
                    : " · not finished"
                  : ""}
              </summary>
              {item.summary ? (
                <SummaryCard summary={item.summary} />
              ) : (
                <p className="muted">No summary yet.</p>
              )}
              <div className="referral-actions">
                {inProgress && item.id !== sessionId && (
                  <button
                    className="secondary"
                    disabled={busy !== ""}
                    onClick={() => void finish(item.id)}
                  >
                    End and summarise
                  </button>
                )}
                <button
                  className="text-button danger"
                  onClick={() => void remove(item.id)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default Practice;
