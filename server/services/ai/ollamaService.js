const OLLAMA_BASE_URL = () => process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = () => process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b';
const OLLAMA_TIMEOUT_MS = () => Number(process.env.OLLAMA_TIMEOUT_MS) || 180000;

/**
 * Checks whether local Ollama is reachable and the configured model is installed.
 */
export async function checkOllamaStatus() {
  const baseUrl = OLLAMA_BASE_URL();
  const targetModel = OLLAMA_MODEL();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) {
      return {
        available: false,
        modelReady: false,
        model: targetModel,
        baseUrl,
        error: `Ollama HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const models = data.models || [];
    const matched = models.find(
      (m) => m.name === targetModel || m.model === targetModel || m.name.startsWith(`${targetModel}:`)
    );

    return {
      available: true,
      modelReady: Boolean(matched),
      model: targetModel,
      digest: matched?.digest ? matched.digest.slice(0, 12) : null,
      sizeMb: matched?.size ? Math.round(matched.size / (1024 * 1024)) : null,
      baseUrl,
      error: matched ? null : `Model ${targetModel} is not installed in Ollama.`,
    };
  } catch (err) {
    return {
      available: false,
      modelReady: false,
      model: targetModel,
      baseUrl,
      error: err.name === 'AbortError' ? 'Ollama connection timed out' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempts to extract valid JSON from a model text response (handles markdown code fences).
 */
export function extractJsonFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip markdown code fences if present
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // continue
      }
    }
    // Extract outermost {...}
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Sends a chat request to local Ollama (/api/chat) with timeout and optional streaming.
 */
export async function chatWithOllama({
  messages,
  expectJson = false,
  stream = false,
  onToken = null,
  temperature = 0.15,
  timeoutMs = OLLAMA_TIMEOUT_MS(),
}) {
  const baseUrl = OLLAMA_BASE_URL();
  const model = OLLAMA_MODEL();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model,
      messages,
      stream,
      options: {
        temperature,
        num_ctx: 4096,
      },
      ...(expectJson ? { format: 'json' } : {}),
    };

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${errText || res.statusText}`);
    }

    if (stream && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const token = parsed.message?.content || '';
            if (token) {
              fullText += token;
              onToken?.(token);
            }
          } catch {
            // partial NDJSON line
          }
        }
      }
      return { content: fullText, model };
    }

    const data = await res.json();
    return {
      content: data.message?.content || '',
      model: data.model || model,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Local AI request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
