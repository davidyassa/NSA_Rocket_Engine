# Ask Sol language model evaluation

Ask Sol uses [a rule-based dialogue layer](../../src/features/assistant/dialogue.ts) and [cited retrieval](../../src/features/assistant/respond.ts). The speech recognition and synthesis models handle audio. This experiment evaluated whether a separate language model could safely rephrase the assistant's answers.

## Setup and results

On 13 November 2026, the team tested six Sol 43 questions with two quantized models running on a MacBook using WebGPU in Chrome. The [prompt](../../src/features/assistant/naturalGuard.ts) requested a one- to three-sentence rewrite of a checked answer. The test used greedy decoding with up to 110 new tokens. The verifier checks for added numbers, unsupported content, diagnosis or medication language, and omitted crew medical officer directions. Safety replies were excluded from the rewrite path.

| Model | Approximate download | Observed load time | Accepted |
| --- | ---: | ---: | ---: |
| SmolLM2-360M-Instruct (q4f16) | 270 MB | 48–52 s | 0 of 6 |
| Qwen2.5-0.5B-Instruct (q4f16) | 480 MB | 78 s | 0 of 6 |

SmolLM2 introduced unsupported claims about sleep, the Sol 41 events, headache, heart rate variability, SANS and carbon dioxide. For example, it described 4.5 hours of sleep as about half of the crew member's usual 7.5 hours. Qwen produced broken or repetitive text in this run. These are results from one small project experiment. The repository retains the verifier and its [unit tests](../../src/features/assistant/naturalGuard.test.ts). The shipped app omits generative rewriting.
