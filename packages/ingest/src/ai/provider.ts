import Anthropic from '@anthropic-ai/sdk';

export interface AiResult {
  text: string;
  tokens: number;
}

export interface AiProvider {
  name: string;
  model: string;
  complete(prompt: string): Promise<AiResult>;
}

/**
 * BYO-key, provider-agnostic. The operator supplies their own API key and
 * pays their own bill; nothing here ever runs unless a key is present.
 * Defaults are deliberately cheap models — the mechanical layer filtered
 * first, the model only glances at the tiny already-suspicious slice.
 */
export function createProvider(
  provider: 'anthropic' | 'openai',
  apiKey: string,
  model?: string,
): AiProvider {
  if (provider === 'anthropic') return anthropicProvider(apiKey, model ?? 'claude-haiku-4-5');
  return openAiProvider(apiKey, model ?? 'gpt-4o-mini');
}

function anthropicProvider(apiKey: string, model: string): AiProvider {
  const client = new Anthropic({ apiKey });
  return {
    name: 'anthropic',
    model,
    async complete(prompt: string): Promise<AiResult> {
      const response = await client.messages.create({
        model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      const tokens = response.usage.input_tokens + response.usage.output_tokens;
      return { text, tokens };
    },
  };
}

function openAiProvider(apiKey: string, model: string): AiProvider {
  return {
    name: 'openai',
    model,
    async complete(prompt: string): Promise<AiResult> {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens?: number };
      };
      return {
        text: (data.choices[0]?.message.content ?? '').trim(),
        tokens: data.usage?.total_tokens ?? 0,
      };
    },
  };
}
