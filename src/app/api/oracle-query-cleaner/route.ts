// src/app/api/oracle-query-cleaner/route.ts

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat';

// Configuração do cliente OpenRouter
const openRouterClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL,
  defaultHeaders: {
    "HTTP-Referer": "https://ai-formatter.com/", // Troque pelo seu domínio
    "X-Title": "AI Formatter - Oracle Cleaner",
  },
});

// Função para criar um stream de resposta
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
    const { query, direction } = await req.json();

    if (!query) {
      return new Response('No query provided.', { status: 400 });
    }
    
    // Define a tarefa com base na direção escolhida pelo usuário
    const taskDescription = direction === 'clean'
      ? "Your task is to convert the provided Oracle PL/SQL 'EXECUTE IMMEDIATE' string into a clean, readable, and executable SQL query. Remove all concatenation operators ('||'), single quotes used for string literals, and the 'v_sql :=' boilerplate. The output must be only the final, clean SQL."
      : "Your task is to convert a clean SQL query into an Oracle PL/SQL 'EXECUTE IMMEDIATE' string format. Wrap the query in single quotes, properly escape any existing single quotes by doubling them (''), and prepare it for assignment to a variable (e.g., 'v_sql := ...;').";

    const exampleInput = direction === 'clean'
      ? "v_sql := 'SELECT name, value FROM settings WHERE type = ''' || p_type || ''' AND group = ''SYSTEM''';"
      : "SELECT status, count(*) FROM tasks WHERE owner = 'JOHN' GROUP BY status;";
      
    const exampleOutput = direction === 'clean'
      ? "SELECT name, value FROM settings WHERE type = p_type AND group = 'SYSTEM';"
      : "v_sql := 'SELECT status, count(*) FROM tasks WHERE owner = ''JOHN'' GROUP BY status;';";

    const systemContent = `You are an expert Oracle SQL and PL/SQL assistant. You will receive a text block and a specific instruction.
${taskDescription}
You must strictly follow these rules:
1.  Analyze the user's input to identify its current format (clean or EXECUTE IMMEDIATE).
2.  Perform the requested conversion flawlessly.
3.  DO NOT add any explanation, introduction, or text before or after the result. Your response must be ONLY the finalized SQL code.
4.  If the input is not a recognizable SQL query, return the exact string: "INVALID_SQL_INPUT".

Here is an example:
- Input for your task:
\`\`\`sql
${exampleInput}
\`\`\`
- Expected output:
\`\`\`sql
${exampleOutput}
\`\`\`
`;

    const userContent = `Please process the following SQL text block according to the established rules:\n\`\`\`\n${query}\n\`\`\``;

    // Modelos configurados via variáveis de ambiente
    const primaryModel = process.env.CLEANER_MODEL_PRIMARY;
    const fallbackModel = process.env.CLEANER_MODEL_FALLBACK;
    const finalFallbackKey = process.env.OPENAI_KEY_FALLBACK;
    const finalFallbackModel = 'gpt-4o'; // Fallback final para o gpt-4o

    if (!primaryModel) {
        console.error("[OracleCleaner] CRITICAL: CLEANER_MODEL_PRIMARY environment variable is not set.");
        return new Response('Server is not configured correctly.', { status: 500 });
    }
    
    console.log(`[OracleCleaner] Request received. Direction: ${direction}.`);

    const completionParams: ChatCompletionCreateParamsStreaming = {
        messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
        ],
        model: primaryModel,
        stream: true,
        temperature: 0.0, // Baixa temperatura para precisão
        max_completion_tokens: 4096,
    };

    try {
        console.log(`[OracleCleaner] Attempting with primary model: ${primaryModel}`);
        const responseStream = await openRouterClient.chat.completions.create({ ...completionParams });
        return new Response(OpenAIStream(responseStream));
    } catch (error1) {
        console.warn(`[OracleCleaner] Primary model (${primaryModel}) failed. Error:`, error1);
        
        if (fallbackModel) {
            try {
                console.log(`[OracleCleaner] Retrying with fallback model: ${fallbackModel}`);
                const fallbackStream = await openRouterClient.chat.completions.create({ ...completionParams, model: fallbackModel });
                return new Response(OpenAIStream(fallbackStream));
            } catch (error2) {
                console.warn(`[OracleCleaner] Fallback model (${fallbackModel}) also failed. Error:`, error2);
            }
        }

        if (finalFallbackKey) {
            try {
                console.log(`[OracleCleaner] Retrying with final fallback (OpenAI API): ${finalFallbackModel}`);
                const openAIClient = new OpenAI({ apiKey: finalFallbackKey });
                const finalFallbackStream = await openAIClient.chat.completions.create({ ...completionParams, model: finalFallbackModel });
                return new Response(OpenAIStream(finalFallbackStream));
            } catch (error3) {
                 console.error(`[OracleCleaner] Final fallback with OpenAI API also failed. Error:`, error3);
            }
        }
    }

    throw new Error("All model attempts failed for Oracle Cleaner.");

  } catch (error) {
    console.error(`[OracleCleaner] Final failure:`, error);
    return new Response('Error communicating with AI.', { status: 500 });
  }
}