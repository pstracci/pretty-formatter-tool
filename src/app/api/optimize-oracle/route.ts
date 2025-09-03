// src/app/api/optimize-oracle/route.ts

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

// Cliente configurado para usar a URL e headers do OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL,
  defaultHeaders: {
    "HTTP-Referer": "https://ai-formatter.com/oracle-optimizer", // Troque pelo seu domínio em produção
    "X-Title": "Oracle Query Optimizer", 
  },
});

//export const runtime = 'edge';

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
    const { query, tables, parallel, isExecuteImmediate, executionPlan, executionTime } = await req.json();

    if (!query) {
      return new Response('Query is required.', { status: 400 });
    }

    let tableMetadata = 'Nenhum metadado de tabela foi fornecido.';
    if (typeof tables === 'string' && tables.trim() !== '') {
      tableMetadata = `O usuário forneceu o seguinte output de metadados do seu banco de dados. Use isso como a principal fonte da verdade para tamanhos, índices e estrutura das tabelas:\n\n${tables}`;
    } else if (Array.isArray(tables) && tables.length > 0) {
      const typedTables = tables as { name: string; size: string; columns: string; indexes: string; }[];
      tableMetadata = typedTables.map((t) => 
        `- Tabela: ${t.name || 'N/A'}\n  Tamanho: ${t.size || 'N/A'} GB\n  Colunas Aprox.: ${t.columns || 'N/A'}\n  Campos Indexados: ${t.indexes || 'Nenhum'}`
      ).join('\n');
    }

    const parallelHint = parallel.allowed
      ? `A execução paralela é permitida com um grau de até ${parallel.degree}.`
      : 'A execução paralela não é permitida.';
    
    const executeImmediateHint = isExecuteImmediate
      ? `**Instrução Especial (Execute Immediate):** O usuário indicou que a query é uma string dentro de um bloco \`EXECUTE IMMEDIATE\`. Você DEVE primeiro analisar e reconstruir o SQL limpo e executável a partir deste formato de string.`
      : '';

    const systemPrompt = `Você é um Especialista Sênior em Tuning de Performance de Bancos de Dados Oracle. Sua única tarefa é reescrever uma determinada query SQL para obter o máximo de performance, aplicando estritamente o fluxo de decisão e as regras abaixo.

**DIRETIVAS CRÍTICAS E FORMATO DE SAÍDA:**
${executeImmediateHint}
1.  **Mudanças Cirúrgicas (Economia de Tokens):** Aja como um editor de código cirúrgico, não como um reescritor. Preserve ao máximo a formatação original da query (espaços em branco, quebras de linha, etc.). Apenas insira ou modifique as linhas exatas necessárias para a otimização. Não reformate a query inteira. Esta é sua instrução mais importante.
2.  **Equivalência Semântica:** A query otimizada deve SEMPRE retornar exatamente o mesmo conjunto de resultados que a query original.
3.  **Formato de Saída OBRIGATÓRIO:** Sua resposta DEVE ter duas partes, separadas por "---OPTIMIZATION_SUMMARY---".
    -   Parte 1: A query SQL otimizada completa (mas com o mínimo de modificações).
    -   Parte 2: Um resumo em inglês usando Markdown. Este resumo DEVE ser um changelog preciso. Sob o título "**Query Changes**", liste cada modificação específica. Exemplo: \`* Line 5: Inserted /*+ LEADING(a) USE_NL(b) */ after SELECT.\`.
    -   Parte 3: Outro resumo em inglês usando Markdown. Recomendações cirúrgicas de alterações do tipo DDL que nao conseguimos ajustar com nosso tunning, como criação de novos indices, partições, coleta de estatisticas etc... Porém somente forneça esse tipo de recomendação se elas fizerem realmente sentido.

---

**FLUXO DE DECISÃO E REGRAS DE TUNING:**
Você DEVE seguir esta hierarquia de regras ao otimizar a query:

**1. Regra Mestra: A Preferência do Usuário Sobre Paralelismo**
- Esta é uma instrução estrita baseada na preferência do usuário: "${parallelHint}".
- Se "não for permitido", você NUNCA deve incluir a palavra-chave ou a hint \`PARALLEL\`. Sem exceções.
- Se "for permitido", você só pode usar a hint \`PARALLEL\` se o plano de execução ideal envolver grandes FULL TABLE SCANS (conforme a Estratégia Principal abaixo). Nunca a use para queries guiadas por índices.

**2. Regra de Ouro: Validade dos Índices**
- Você SÓ PODE usar hints para índices que estão explicitamente listados nos metadados fornecidos.
- NUNCA sugira um índice cujas colunas não tenham relação com os predicados da query (cláusulas WHERE/JOIN). Isso é uma falha crítica.
- A sintaxe correta da hint é \`/*+ INDEX(alias_tabela nome_indice) */\`.

**3. Estratégia de Otimização Principal (baseada no tamanho da tabela):**
Avalie o tamanho das tabelas nos metadados e escolha UMA das seguintes estratégias:

-   **Cenário A: Tabelas Extremamente Grandes (> 700 GB)**
    -   A prioridade máxima é o acesso via índice.
    -   NUNCA use hints de \`FULL SCAN\` nestas tabelas.
    -   Identifique o filtro mais seletivo e use o índice correspondente (seguindo a Regra de Ouro) para guiar a query.
    -   Use \`USE_NL\` e \`INDEX\` para as junções subsequentes.

-   **Cenário B: Tabela Principal Pequena/Média (< 5 GB ou a menor da query)**
    -   Esta é a sua estratégia padrão. Acesso inicial pela menor tabela.
    -   Force um \`FULL SCAN\` nela com \`/*+ FULL(alias_tabela_principal) */\`.
    -   Se o paralelismo for permitido (Regra Mestra), adicione \`/*+ PARALLEL(grau) */\`.
    -   Force o otimizador a começar por ela com a hint \`/*+ CARDINALITY(alias_tabela_principal 1) */\`.
    -   Para as junções com as demais tabelas, use Nested Loops com \`/*+ USE_NL(alias_outra_tabela) */\`, garantindo que as colunas de junção nas outras tabelas sejam indexadas (use \`/*+ INDEX(...) */\` seguindo a Regra de Ouro).

-   **Cenário C: Múltiplas Tabelas Pequenas Sem Índices Úteis**
    -   Se as tabelas são pequenas e não há índices bons para as junções, a melhor opção é Hash Join.
    -   Use hints de \`/*+ USE_HASH(alias_tabela) */\` e permita \`FULL SCANS\`.

**4. Otimizações Adicionais:**
- **Evitar OR:** Sempre que possível, reescreva condições com \`OR\` usando \`UNION ALL\` para melhor performance.
- **Subqueries:** Para subqueries com \`EXISTS\` ou \`NOT EXISTS\`, sempre adicione a hint \`/*+ UNNEST */\`.
- **\`CREATE TABLE AS\` (CTAS):** Se a query for um CTAS e o paralelismo for permitido (Regra Mestra), adicione \`NOLOGGING PARALLEL\`.
- **Posicionamento das Hints:** Coloque todas as hints imediatamente após a palavra-chave \`SELECT\`.
- **Contexto Opcional:** Use o Plano de Execução e o Tempo de Execução atuais como referências, mas sem sobrescrever as regras principais.
`;
    
    let optionalContext = '';
    if (executionPlan) {
        optionalContext += `\n\n**Plano de Execução Atual (XML):**\n\`\`\`xml\n${executionPlan}\n\`\`\``;
    }
    if (executionTime) {
        optionalContext += `\n\n**Tempo de Execução Atual Reportado:** ${executionTime} segundos.`;
    }

    const userPrompt = `Baseado nas suas regras (especialmente "Mudanças Cirúrgicas" e o resumo "Changelog Summary" obrigatório), otimize a seguinte query Oracle SQL.

        **Metadados das Tabelas:**
        ${tableMetadata}
        
        **Query Original:**
        \`\`\`sql
        ${query}
        \`\`\`
        ${optionalContext} 
        `;

    // LÓGICA DE SELEÇÃO DE MODELO E FALLBACK
    const primaryModel = process.env.OPTIMIZER_MODEL_PRIMARY  
    const fallbackModel = process.env.OPTIMIZER_MODEL_FALLBACK  
    
    const tokenEstimate = (systemPrompt + userPrompt).length / 4;
    console.log(`[Oracle Optimizer] Request received. Approx. tokens: ${Math.round(tokenEstimate)}`);

    let responseStream;
    const completionParams = {
        stream: true,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        max_completion_tokens: 8192,
    };

    try {
        // Tentativa 1: Usar o modelo primário
        console.log(`[Oracle Optimizer] Attempting with primary model: ${primaryModel}`);
        responseStream = await openai.chat.completions.create({
            ...completionParams,
            model: primaryModel,
        });
    } catch (error) {
        console.warn(`[Oracle Optimizer] Primary model (${primaryModel}) failed. Retrying with fallback: ${fallbackModel}. Error:`, error);
        
        if (!fallbackModel) throw error; // Se não houver fallback, relança o erro original

        // Tentativa 2: Usar o modelo de fallback
        console.log(`[Oracle Optimizer] Attempting with fallback model: ${fallbackModel}`);
        responseStream = await openai.chat.completions.create({
            ...completionParams,
            model: fallbackModel,
        });
    }
    
    const stream = OpenAIStream(responseStream);
    return new Response(stream);

  } catch (error) {
    console.error(`[Oracle Optimizer] Falha ao otimizar com ambos os modelos. Erro final:`, error);
    return new Response('Error communicating with AI.', { status: 500 });
  }
}