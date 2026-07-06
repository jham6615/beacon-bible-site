// Supabase Edge Function — AI proxy for Beacon Bible.
//
// This is a thin pass-through: the app sends ready-made chat messages, this adds the secret OpenAI key
// (read from a Secret named OPENAI_API_KEY — NOT written in this code) and returns the model's reply.
// All prompt wording lives in the app (src/lib/api.ts), so tone/length tweaks need only an app reload.
//
// Before a public launch: add rate limiting / auth — this currently accepts any request bearing the
// app's publishable key.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req: Request) => {
    try {
      const { messages, temperature = 0.7, maxTokens = 600 } = await req.json().catch(() => ({}));
      if (!Array.isArray(messages) || messages.length === 0) {
        return Response.json({ error: 'messages[] is required' }, { status: 400 });
      }

      const key = Deno.env.get('OPENAI_API_KEY');
      if (!key) return Response.json({ error: 'OPENAI_API_KEY is not set' }, { status: 500 });

      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) return Response.json({ error: `OpenAI ${res.status}: ${await res.text()}` }, { status: 500 });
      const data = await res.json();
      return Response.json({ content: data.choices?.[0]?.message?.content ?? '' });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }),
};
