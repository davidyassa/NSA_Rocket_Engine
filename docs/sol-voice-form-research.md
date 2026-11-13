# Voice entry for Sol Check

Reviewed 13 November 2026, Cairo time.

## Sol Check's own form

Sol already transcribes speech with a bundled English Whisper model and passes the resulting text to its answer handler. Check-in already owns a draft for metric values, symptoms, and notes. For the demo, “Log my check-in” could start a parser that accepts explicitly spoken values, opens `/check-in`, and populates its existing draft. “My pulse was 82, my blood pressure was 118 over 76, and I slept six and a half hours” could fill heart rate, both blood pressure fields, and sleep duration. Sol could ask for clarification when a number, unit, or symptom is ambiguous, then open Review & Save for the speaker to confirm and save. [Whisper worker](../src/features/assistant/whisper.worker.ts#L3) · [Voice transcript handling](../src/features/assistant/VoiceMode.tsx#L124) · [Check-in route](../src/app/App.tsx#L186) · [Check-in validation](../src/features/checkin/Checkin.tsx#L321)

## Browser and desktop tools

| Tool | Fit for dictation and form entry |
| --- | --- |
| **Nanobrowser** | A quick way to try a prompt against an existing Chrome or Edge tab. Its agent can use Ollama or LM Studio. Its built-in microphone sends recordings to an OpenAI or Google voice model. For on-device speech recognition, feed the extension text produced by local dictation. [Quickstart](https://nanobrowser.ai/docs/quickstart) · [Privacy and security](https://nanobrowser.ai/docs/privacy) |
| **Vercel `agent-browser`** | A browser CLI that a local helper can invoke to locate and fill web fields. It can launch a browser or attach to Chrome with remote debugging enabled. The helper or Sol owns transcription and decides which values to enter. [Commands](https://agent-browser.dev/commands) · [CDP mode](https://agent-browser.dev/cdp-mode) |
| **`tappi`** | The PyPI package documents Chrome control through its CLI, Python library, and MCP server. Those interfaces can execute browser actions for another process. The published agent setup lists cloud providers. Ollama support for its own prompt-driven mode remains unverified. Its linked GitHub repository returned 404 during this review. [Publisher documentation](https://pypi.org/project/tappi/) |
| **Vercel `agent-desktop`** | A CLI and C library for native desktop apps. It exposes the operating system's accessibility tree and actions. Its documentation directs webpage automation to `agent-browser`. [Desktop documentation](https://agent-browser.dev/desktop) |
| **Accomplish and UI-TARS Desktop** | Accomplish's official Coworker repository says the project is no longer supported. ByteDance archived UI-TARS Desktop on 9 November 2026. [Accomplish Coworker](https://github.com/accomplish-ai/coworker) · [UI-TARS Desktop](https://github.com/bytedance/UI-TARS-desktop) |

For a website outside Sol Check, a local companion could receive a structured draft and invoke `agent-browser` against the intended site and tab. A separate persistent browser profile gives the automation its own login session. Chrome's command-line remote-debugging flags require a non-default data directory in standard Chrome, and newer Chrome can also enable remote debugging from its settings with a connection prompt. [Chrome remote debugging changes](https://developer.chrome.com/blog/remote-debugging-port) · [Chrome connection and tab pinning](https://agent-browser.dev/cdp-mode)

This review used project source and published documentation. It did not install the tools or exercise an external website.
