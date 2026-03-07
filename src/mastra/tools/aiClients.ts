const PERPLEXITY_API_KEY =
  process.env.PERPLEXITY_API_KEY || "YOUR_PERPLEXITY_API_KEY";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "YOUR_OPENAI_API_KEY";

export const DEFAULT_PERPLEXITY_MODEL =
  process.env.PERPLEXITY_MODEL || "sonar-pro";
export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

function isPlaceholder(value: string): boolean {
  return value.startsWith("YOUR_");
}

export function hasPerplexityConfig() {
  return !isPlaceholder(PERPLEXITY_API_KEY);
}

export function hasOpenAIConfig() {
  return !isPlaceholder(OPENAI_API_KEY);
}

export async function perplexityChat(prompt: string): Promise<string> {
  if (isPlaceholder(PERPLEXITY_API_KEY)) {
    throw new Error(
      "PERPLEXITY_API_KEY is not configured. Set it to your real key.",
    );
  }

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_PERPLEXITY_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a factual biotech company research assistant. Return concise, structured responses.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Perplexity API error: ${response.status} ${response.statusText}`,
    );
  }

  const data: any = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

export async function openAIChat(prompt: string): Promise<string> {
  if (isPlaceholder(OPENAI_API_KEY)) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it to your real key.",
    );
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are ChatGPT and provide rigorous sales qualification logic for life-science company fit decisions.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText}`,
    );
  }

  const data: any = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}
