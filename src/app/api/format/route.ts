// Formatted by verbi.com.br
// src/app/api/format/route.ts

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { code, language } = await req.json();

    // --- ADICIONE OS ESPIÕES AQUI ---
    console.log("----------- DEBUG INICIADO -----------");
    console.log("1. CÓDIGO BRUTO RECEBIDO (pode ter lixo invisível):");
    console.log(code);
    
    if (!code) {
      return NextResponse.json({ error: 'Nenhum código fornecido.' }, { status: 400 });
    }

    const cleanedCode = code.replace(/\u00A0/g, ' ');

    // --- NOVA LÓGICA PARA GERAR A DATA E HORA ---
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Meses começam do 0
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const timestamp = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    const commentText = `Formatted by pretty-formatter-tool -- ${timestamp}`;
    // -------------------------------------------
    
    console.log("2. CÓDIGO APÓS LIMPEZA (o que vai para a IA):");
    console.log(cleanedCode);
    console.log("----------- DEBUG FINALIZADO -----------");
    // ------------------------------------

    const optimizationHint = (language && language !== 'auto') 
      ? `O usuário deu uma dica de que o conteúdo é '${language}'. Dê uma atenção especial para formatar seguindo as melhores práticas para este formato.`
      : '';

    const prompt = `
      Você é um formatador de código especialista e preservador de conteúdo. Sua única função é receber um texto e retorná-lo formatado.
      Sua regra MAIS IMPORTANTE é: NÃO omita, remova ou delete NENHUMA parte do texto original. TODO o conteúdo de entrada deve estar presente na saída.

      Suas tarefas são:
      1. Analisar o texto inteiro.
      2. Formatar APENAS os trechos que você reconhecer como código ou logs, de acordo com as melhores práticas (indentação, espaçamento, etc.).
      3. Se um trecho do texto não for código ou log formatável, ele deve ser MANTIDO EXATAMENTE COMO ESTÁ, na sua posição original.
      4. A estrutura geral e a ordem do conteúdo devem ser preservadas.
      
      // --- INSTRUÇÃO DO COMENTÁRIO ATUALIZADA ---
      5. Na PRIMEIRA linha do resultado, adicione um comentário com o texto exato: "${commentText}". O formato do comentário (ex: "//", "#", "") deve ser apropriado para a linguagem principal detectada.
      // -------------------------------------------

      6. ${optimizationHint}
      7. NÃO adicione nenhuma explicação, introdução, ou texto antes ou depois do resultado. Sua resposta deve ser APENAS o conteúdo finalizado.
      8. Se o texto de entrada for um completo amontoado de caracteres sem sentido, retorne a string exata: "UNFORMATTABLE_TEXT".
      
      Texto para processar:
      \`\`\`
      ${cleanedCode}
      \`\`\`
    `;
	
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', 
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 6000,
    });

    const formattedCode = response.choices[0].message?.content?.trim();

    return NextResponse.json({ formattedCode });
  } catch (error) {
    console.error('Erro na API da OpenAI:', error);
    return NextResponse.json({ error: 'Erro ao se comunicar com a IA.' }, { status: 500 });
  }
}