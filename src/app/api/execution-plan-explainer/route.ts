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
    const { executionPlanXml: executionPlanText } = await req.json();

    if (!executionPlanText) {
      return new Response('No execution plan provided.', { status: 400 });
    }

    const content = executionPlanText.toLowerCase();

    // Checagem para formato XML
    const isXmlPlan = (content.includes('<plan>') || content.includes('<explainplan>') || content.includes('<sql_plan>')) &&
                       content.includes('operation=') &&
                       content.includes('cost=');

    // ===== VALIDAÇÃO DE TEXTO REESCRITA PARA SER MAIS ROBUSTA =====
    const hasOperationKeyword = content.includes('table access') || content.includes('index') || content.includes('hash join') || content.includes('px coordinator') || content.includes('nested loops');
    const hasMetricKeyword = content.includes('cost:') || content.includes('cardinality:') || content.includes('bytes:');
    const hasStatementType = content.includes('statement');
    const isTextPlan = hasOperationKeyword && hasMetricKeyword && hasStatementType;

    // Checagem para formato HTML (OEM)
    const isHtmlPlan = content.includes('<table') &&
                       content.includes('operation') &&
                       content.includes('object_name') &&
                       content.includes('cost');

    if (!isXmlPlan && !isTextPlan && !isHtmlPlan) {
        return new Response('The provided content does not appear to be a valid Oracle XML, Text, or HTML execution plan. Please provide a valid file.', { status: 400 });
    }
    
    // O prompt já é genérico o suficiente e não precisa de alteração
    const systemPrompt = `You are an expert Oracle DBA. Your task is to explain an Oracle execution plan. The plan can be in XML, plain text (like from DBMS_XPLAN), or HTML table format (like from OEM). Your explanation must be simple, step-by-step, and in English using Markdown.

First, identify the format (XML, Text, or HTML).

Regardless of the format, your response MUST follow this exact structure:

### Execution Flow
Analyze the plan from the first step Oracle performs (most indented, deepest in the hierarchy, or last in the table) to the last.
**Each step MUST be separated by a blank line.**

For each step, use the following Markdown format:

**Step X:**
- **Operation:** \`[Operation Name]\`
- **Target:** \`[Table or Index Name]\`
- **Details:** A very simple, one-sentence explanation. **If an index is used, you MUST state its name.**
- **For JOIN operations,** the "Target" should be \`(Results of previous steps)\` and the "Details" must explain which steps are being combined.

### Summary & Suggestions
After the step-by-step list, provide this final section.
1.  **Overall Cost:** Briefly state the total estimated Cost from the plan's top-level operation (Id=0 or the first row).
2.  **Analysis:** In one or two sentences, give your opinion on the plan's efficiency.
3.  **Improvements:** If you find a bottleneck, suggest improvements. You MUST recommend using the "Oracle Query Optimizer" tool on this same website to get a rewritten, optimized query. If the plan is good, state that no major improvements are needed.

**How to parse the different formats:**
- **For XML:** Extract info from attributes like 'operation', 'object_name', and 'cost'.
- **For Text:** Extract info from the 'Operation' and 'Name' columns. Indentation shows the execution order.
- **For HTML:** The plan is in a \`<table>\`. Parse the \`<tr>\` and \`<td>\` tags to get data from the 'OPERATION', 'OBJECT_NAME', and 'COST' columns. The visual indentation or row order indicates the execution flow.`;
    
    const userContent = `Here is the Oracle execution plan. Please analyze it based on its format (XML, Text, or HTML) and provide the explanation in the requested step-by-step structure.\n\n\`\`\`\n${executionPlanText}\n\`\`\``;

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