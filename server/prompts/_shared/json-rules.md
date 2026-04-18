## JSON output rules

Your only output is a single JSON object. No prose, no markdown, no commentary.

- **First character is `{`, last character is `}`.**
<!-- Why: Any leading prose or trailing remark breaks JSON.parse. The provider
     layer strips markdown fences mechanically, but it does not try to
     extract JSON from surrounding prose. Start with `{` and end with `}`. -->

- **No markdown fences.** Do not wrap the JSON in triple backticks.
<!-- Why: DeepSeek and Sonnet both sometimes wrap JSON in ```json ... ``` even
     when instructed not to. The provider strips them mechanically as a
     preprocessing step, but the cleaner the raw response is, the fewer
     retries we burn on parse failures. -->

- **No unescaped newlines inside JSON strings.** Use `\n`.
<!-- Why: A raw newline inside a JSON string is the single most common cause
     of JSON.parse failure on long-form content like resume bullets. -->

- **Every `{` and `[` has a matching `}` and `]`.** Balance braces and
  brackets. Do not truncate the JSON mid-object even if it gets long.
<!-- Why: Models under token pressure truncate silently; a truncated JSON
     is unparseable. If you are running out of room, shorten field values,
     not structure. -->

- **No trailing commas.** `{"a": 1, "b": 2,}` is not valid JSON.
<!-- Why: DeepSeek occasionally emits trailing commas in arrays. JSON.parse
     rejects them. -->

- **No comments.** Do not add `//` or `/* */` comments in the JSON output.
<!-- Why: JSON has no comment syntax. Some models insert them to annotate
     their thinking; all we can do is parse what they emit, so the output
     must be pure JSON. -->

If your first attempt produces invalid JSON, you will receive a retry prompt
with the parser error. Use the second attempt to fix the specific error.
There is no third attempt — the pipeline fails loudly if retry also fails.
