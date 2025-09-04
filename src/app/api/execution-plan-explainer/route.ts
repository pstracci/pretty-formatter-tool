// src/app/api/execution-plan-explainer/route.ts

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat';

// Cliente principal, configurado para usar a API do OpenRouter
const openRouterClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL,
  defaultHeaders: {
    "HTTP-Referer": "https://ai-formatter.com/execution-plan-explainer", 
    "X-Title": "Execution Plan Explainer", 
  },
});

function OpenAIStream(stream: AsyncIterable<ChatCompletionChunk>) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const textChunk = chunk.choices[0]?.delta?.content || '';
        if (textChunk) {
          controller.enqueue(encoder.encode(textChunk));
        }
      }
      controller.close();
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { executionPlanXml } = await req.json();

    if (!executionPlanXml) {
      return new Response('No execution plan provided.', { status: 400 });
    }
    
    // ===== PROMPT ATUALIZADO PARA MELHOR LEGIBILIDADE =====
    const systemPrompt = `You are an expert Oracle DBA. Your task is to explain an XML execution plan in an extremely simple, step-by-step format. The explanation must be in English and use Markdown.

Your response MUST follow this exact structure:

### Execution Flow
Analyze the plan from the first step Oracle performs (most indented) to the last.
**Each step MUST be separated by a blank line.**

For each step, use the following Markdown format:

**Step X:**
- **Operation:** \`[Operation Name]\` (e.g., \`TABLE ACCESS FULL\`, \`INDEX RANGE SCAN\`)
- **Target:** \`[Table Name]\`
- **Details:** A very simple, one-sentence explanation. **If an index is used, you MUST state its name.** (e.g., "The database will read the table by scanning the \`IDX_EMP_NAME\` index.")
- **For JOIN operations,** the "Target" should be \`(Results of previous steps)\` and the "Details" must explain which steps are being combined, for example: "The results from Step 3 and Step 4 will be combined using a \`NESTED LOOPS\` join."

### Summary & Suggestions
After the step-by-step list, provide this final section.
1.  **Overall Cost:** Briefly state the total estimated CPU Cost from the plan's top-level operation (Id=0).
2.  **Analysis:** In one or two sentences, give your opinion on the plan's efficiency.
3.  **Improvements:** If you find a bottleneck (like a full table scan), suggest improvements. You MUST recommend using the "Oracle Query Optimizer" tool on this same website to get a rewritten, optimized query. If the plan is good, state that no major improvements are needed.`;
    
    const userContent = `Here is the Oracle execution plan in XML format. Please analyze it and provide the explanation in the requested step-by-step format.\n\n\`\`\`xml\n${executionPlanXml}\n\`\`\``;

    const primaryModel = process.env.EXPLAINER_MODEL_PRIMARY;
    const fallbackModel = process.env.EXPLAINER_MODEL_FALLBACK;
    const finalFallbackKey = process.env.OPENAI_KEY_FALLBACK;
    const finalFallbackModel = 'gpt-4o';

    if (!primaryModel) {
        console.error("[Plan Explainer] CRITICAL: EXPLAINER_MODEL_PRIMARY environment variable is not set.");
        return new Response('Server is not configured correctly.', { status: 500 });
    }
    
    console.log(`[Plan Explainer] Request received.`);

    const completionParams: ChatCompletionCreateParamsStreaming = {
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ],
        model: primaryModel,
        stream: true,
        temperature: 0.1,
        max_completion_tokens: 8192, 
    };

    try {
        console.log(`[Plan Explainer] Attempting with primary model (OpenRouter): ${primaryModel}`);
        const responseStream = await openRouterClient.chat.completions.create({
            ...completionParams,
            model: primaryModel,
        });
        return new Response(OpenAIStream(responseStream));
    } catch (error1) {
        console.warn(`[Plan Explainer] Primary model (${primaryModel}) failed. Error:`, error1);
        
        if (fallbackModel) {
            try {
                console.log(`[Plan Explainer] Retrying with fallback model (OpenRouter): ${fallbackModel}`);
                const fallbackStream = await openRouterClient.chat.completions.create({
                    ...completionParams,
                    model: fallbackModel,
                });
                return new Response(OpenAIStream(fallbackStream));
            } catch (error2) {
                console.warn(`[Plan Explainer] Fallback model (${fallbackModel}) also failed. Error:`, error2);
            }
        }

        if (finalFallbackKey) {
            try {
                console.log(`[Plan Explainer] All OpenRouter models failed. Retrying with final fallback (OpenAI API): ${finalFallbackModel}`);
                const openAIClient = new OpenAI({ apiKey: finalFallbackKey });
                const finalFallbackStream = await openAIClient.chat.completions.create({
                    ...completionParams,
                    model: finalFallbackModel,
                });
                return new Response(OpenAIStream(finalFallbackStream));
            } catch (error3) {
                 console.error(`[Plan Explainer] Final fallback with OpenAI API also failed. Error:`, error3);
            }
        }
    }

    throw new Error("All model attempts failed.");

  } catch (error) {
    console.error(`[Plan Explainer] Falha ao analisar com todos os modelos. Erro final:`, error);
    return new Response('Error communicating with AI.', { status: 500 });
  }
}