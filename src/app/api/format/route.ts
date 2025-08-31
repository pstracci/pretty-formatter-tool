// src/app/api/format/route.ts

import { NextRequest } from 'next/server';
import OpenAI from 'openai';

// Usando apenas a biblioteca oficial e estável da OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge';

// Função auxiliar para converter o stream da OpenAI em um formato que o navegador entende
function OpenAIStream(stream: AsyncIterable<any>) {
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

    const responseStream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        {
          role: 'system',
          content: `You are an expert code formatter and content preserver. Your only function is to receive text and return it formatted.
Your MOST IMPORTANT rule is: DO NOT omit, remove, or delete ANY part of the original text. ALL input content must be present in the output.
Your tasks are:
1. Analyze the entire text.
2. Format ONLY the parts you recognize as code or logs according to best practices (indentation, spacing, etc.).
3. If a piece of text is not formattable code or a log, it MUST BE KEPT EXACTLY AS IT IS, in its original position.
4. The overall structure and order of the content must be preserved.
5. On the VERY FIRST line of the result, add a comment with the exact text: "${commentText}". The comment format (e.g., "//", "#", "") must be appropriate for the main language detected.
6. ${optimizationHint}
7. DO NOT add any explanation, introduction, or text before or after the result. Your response must be ONLY the finalized content.
8. If the input text is complete gibberish, return the exact string: "UNFORMATTABLE_TEXT".`
        },
        {
          role: 'user',
          content: `Please process the following text block:\n\`\`\`\n${cleanedCode}\n\`\`\``
        }
      ],
      temperature: 0.1,
    });
    
    const stream = OpenAIStream(responseStream);
    return new Response(stream);

  } catch (error) {
    console.error('Error with OpenAI API:', error);
    return new Response('Error communicating with AI.', { status: 500 });
  }
}