/**
 * Run title + breakdown_messages for the processing UI (gpt-4o-mini).
 * Same prompt contract as the former Python breakdown_run_copy helper.
 */

import OpenAI from "openai";
import { env } from "~/env";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const BREAKDOWN_SYSTEM = `You generate a short title and playful loading messages for a video creation app. The user pasted content and the app is analyzing it to create short-form videos.

Title:
- 3-8 words, descriptive of the content (topic, theme, or vibe)
- Suitable for a list/card view (e.g. "How to Make Sourdough", "The History of Coffee", "5 Productivity Hacks")

Messages (each 2-8 words):
- Feel like a Discord update: witty, light, occasionally silly
- Reference the content when possible (topics, tone, themes)
- Sound like something is actively happening

Infer content type from the text (how-to, essay, transcript, story, recipe, etc.) and tailor both title and messages. Avoid generic phrases like "Analyzing..." unless you add a twist.

Examples: "Consulting the content council…", "Finding the climax…", "Checking if the intro hooks…"
`;

export async function generateBreakdownContent(content: string): Promise<{
  title: string | null;
  breakdownMessagesJson: string | null;
}> {
  const truncated = content.slice(0, 4000);
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: BREAKDOWN_SYSTEM },
        {
          role: "user",
          content:
            `${truncated}\n\nRespond with JSON only: {"title": string, "messages": string[]}`,
        },
      ],
      max_tokens: 250,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      console.warn("[generateBreakdownContent] Empty model response");
      return { title: null, breakdownMessagesJson: null };
    }
    const data = JSON.parse(raw) as { title?: unknown; messages?: unknown };
    const title =
      typeof data.title === "string" && data.title.trim().length > 0
        ? data.title.trim().slice(0, 80)
        : null;
    const messages = Array.isArray(data.messages)
      ? data.messages.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      : [];
    if (!title || messages.length === 0) {
      console.warn("[generateBreakdownContent] Invalid generated payload", {
        hasTitle: !!title,
        messagesCount: messages.length,
      });
      return { title: null, breakdownMessagesJson: null };
    }
    return {
      title,
      breakdownMessagesJson: JSON.stringify(messages),
    };
  } catch (error) {
    console.warn("[generateBreakdownContent] Failed to generate title/messages", {
      error: errorMessage(error),
    });
    return { title: null, breakdownMessagesJson: null };
  }
}
