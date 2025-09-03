// src/app/api/format/route.ts

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat';

const openRouterClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Sua chave do OpenRouter
  baseURL: process.env.OPENROUTER_BASE_URL,
  defaultHeaders: {
    "HTTP-Referer": "https://ai-formatter.com/", // Troque pelo seu domínio em produção
    "X-Title": "AI Formatter", 
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
    const { code, language } = await req.json();

    if (!code) {
      return new Response('No code provided.', { status: 400 });
    }
    
    const cleanedCode = code.replace(/\u00A0/g, ' ');
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    const commentText = `Formatted by ai-formatter.com -- ${timestamp}`;

    const optimizationHint = (language && language !== 'auto') 
      ? `The user has provided a hint that the content is '${language}'. Pay special attention to formatting it according to the best practices for this format.`
      : '';
    
   const systemContent = `You are an expert code formatter and content preserver. Your only function is to receive text and return it formatted.
Your MOST IMPORTANT rule is: DO NOT omit, remove, or delete ANY part of the original text. ALL input content must be present in the output.
Your tasks are:
1. Analyze the entire text.
2. Format ONLY the parts you recognize as code or logs according to best practices (indentation, spacing, etc.).
3. If a piece of text is not formattable code or a log, it MUST BE KEPT EXACTLY AS IT IS, in its original position.
4. The overall structure and order of the content must be preserved.
5. On the VERY FIRST line of the result, add a comment with the exact text: "${commentText}". The comment format (e.g., "//", "#", "") must be appropriate for the main language detected.
6. ${optimizationHint}
7. DO NOT add any explanation, introduction, or text before or after the result. Your response must be ONLY the finalized content.
8. If the input text is complete gibberish, return the exact string: "UNFORMATTABLE_TEXT".`;

    const userContent = `Please process the following text block:\n\`\`\`\n${cleanedCode}\n\`\`\``;

    const primaryModel = process.env.FORMATTER_MODEL_PRIMARY;
    const fallbackModel = process.env.FORMATTER_MODEL_FALLBACK;
    const finalFallbackKey = process.env.OPENAI_KEY_FALLBACK;
    const finalFallbackModel = 'gpt-4o-mini'; // Modelo hardcoded da OpenAI

    if (!primaryModel) {
        console.error("[Formatter] CRITICAL: FORMATTER_MODEL_PRIMARY environment variable is not set.");
        return new Response('Server is not configured correctly.', { status: 500 });
    }
    
    const tokenEstimate = (systemContent + userContent).length / 4;
    console.log(`[Formatter] Request received. Approx. tokens: ${Math.round(tokenEstimate)}`);

    const completionParams: ChatCompletionCreateParamsStreaming = {
        messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
        ],
        model: primaryModel,
        stream: true,
        temperature: 0.1,
        max_completion_tokens: 8192, 
    };

    try {
        // Tentativa 1: Modelo Primário via OpenRouter
        console.log(`[Formatter] Attempting with primary model (OpenRouter): ${primaryModel}`);
        const responseStream = await openRouterClient.chat.completions.create({
            ...completionParams,
            model: primaryModel,
        });
        return new Response(OpenAIStream(responseStream));
    } catch (error1) {
        console.warn(`[Formatter] Primary model (${primaryModel}) failed. Error:`, error1);
        
        // Tentativa 2: Modelo de Fallback via OpenRouter
        if (fallbackModel) {
            try {
                console.log(`[Formatter] Retrying with fallback model (OpenRouter): ${fallbackModel}`);
                const fallbackStream = await openRouterClient.chat.completions.create({
                    ...completionParams,
                    model: fallbackModel,
                });
                return new Response(OpenAIStream(fallbackStream));
            } catch (error2) {
                console.warn(`[Formatter] Fallback model (${fallbackModel}) also failed. Error:`, error2);
            }
        }

        // Tentativa 3: Fallback final com a API da OpenAI
        if (finalFallbackKey) {
            try {
                console.log(`[Formatter] All OpenRouter models failed. Retrying with final fallback (OpenAI API): ${finalFallbackModel}`);
                const openAIClient = new OpenAI({ apiKey: finalFallbackKey });
                const finalFallbackStream = await openAIClient.chat.completions.create({
                    ...completionParams,
                    model: finalFallbackModel,
                });
                return new Response(OpenAIStream(finalFallbackStream));
            } catch (error3) {
                 console.error(`[Formatter] Final fallback with OpenAI API also failed. Error:`, error3);
            }
        }
    }

    // Se todas as tentativas falharem, joga o erro para o catch principal
    throw new Error("All model attempts failed.");

  } catch (error) {
    console.error(`[Formatter] Falha ao formatar com todos os modelos. Erro final:`, error);
    return new Response('Error communicating with AI.', { status: 500 });
  }
}