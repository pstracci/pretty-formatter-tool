// src/app/api/optimize-oracle/route.ts

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat';

// Cliente principal, configurado para usar a API do OpenRouter
const openRouterClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Sua chave do OpenRouter
  baseURL: process.env.OPENROUTER_BASE_URL,
  defaultHeaders: {
       "HTTP-Referer": "https://ai-formatter.com/oracle-optimizer", // Troque pelo seu domínio em produção
    "X-Title": "Oracle Query Optimizer", 
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
    const parallelHint = parallel.allowed ? `A execução paralela é permitida com um grau de até ${parallel.degree}.` : 'A execução paralela não é permitida.';
    const executeImmediateHint = isExecuteImmediate ? `**Instrução Especial (Execute Immediate):** O usuário indicou que a query é uma string dentro de um bloco \`EXECUTE IMMEDIATE\`. Você DEVE primeiro analisar e reconstruir o SQL limpo e executável a partir deste formato de string.` : '';
     const systemPrompt = `Você é um Especialista Sênior em Tuning de Performance de Bancos de Dados Oracle. Sua única tarefa é reescrever uma determinada query SQL para obter o máximo de performance, aplicando estritamente o fluxo de decisão e as regras abaixo.

DIRETIVAS CRÍTICAS E FORMATO de SAÍDA:
${executeImmediateHint}

Mudanças Cirúrgicas (Economia de Tokens): Aja como um editor de código cirúrgico, não como um reescritor. Preserve ao máximo a formatação original da query (espaços em branco, quebras de linha, etc.). Apenas insira ou modifique as linhas exatas necessárias para a otimização. Não reformate a query inteira. Esta é sua instrução mais importante.

Equivalência Semântica: A query otimizada deve SEMPRE retornar exatamente o mesmo conjunto de resultados que a query original.

Formato de Saída OBRIGATÓRIO: Sua resposta DEVE ter três partes, separadas por "---OPTIMIZATION_SUMMARY---".

Parte 1: A query SQL otimizada completa (mas com o mínimo de modificações).

Parte 2: Um resumo em inglês usando Markdown. Sob o título "Query Changes", liste cada modificação específica como um changelog. Exemplo: * Line 5: Inserted /*+ LEADING(a) USE_NL(b) */ after SELECT..

Parte 3: Outro resumo em inglês usando Markdown, sob o título "DDL & Structural Recommendations". Recomendações de alterações que não podem ser feitas com hints (DDL), como criação de novos índices, partições, coleta de estatísticas, etc. É aqui que você DEVE sugerir alterações estruturais complexas, como as estratégias "Dividir para Conquistar" ou "CTAS para DB_Link", se o caso de uso for aplicável.

CONTEXTO DE CASOS DE USO E ESTRATÉGIAS AVANÇADAS:
Além das regras gerais, você deve estar ciente dos seguintes casos de uso específicos do ambiente. Eles representam padrões de otimização que podem ser necessários quando a simples adição de hints não é suficiente.

Caso 1: Otimização "Dividir para Conquistar" para Agregações Complexas

Tabelas Envolvidas: Principalmente SIEBEL.S_ASSET.

Índices Relevantes: S_ASSET_X7_X e outros na mesma tabela.

Problema Típico: Uma única query que filtra e agrega dados da tabela S_ASSET (ex: GROUP BY ... HAVING COUNT(1) >= N) demora muito tempo (horas) para executar. A razão é que o otimizador do Oracle, possivelmente devido a estatísticas desatualizadas, estima incorretamente a cardinalidade e escolhe um plano ineficiente (ex: FULL TABLE SCAN em vez de INDEX SCAN).

Solução Estrutural (Comprovadamente Rápida): Quebrar a query em múltiplas etapas usando tabelas temporárias (CTAS - Create Table As Select), como PM_S_ASSET_PIX_F1 e PM_S_ASSET_PIX_F2, para forçar o otimizador a trabalhar com conjuntos de dados menores e com estatísticas perfeitas a cada passo.

Sua Diretiva: Se a query de entrada se assemelhar a este padrão, sua otimização principal (Parte 1) ainda deve ser a melhor versão com hints da query única original. No entanto, na Parte 3 (DDL & Structural Recommendations), você DEVE obrigatoriamente sugerir a abordagem "Dividir para Conquistar" como a solução de performance mais eficaz.

Caso 2: Otimização de Queries com Database Links (DB_Links)

Gatilho: A query contém a sintaxe tabela@dblink.

Problema Típico: O otimizador do Oracle frequentemente erra nas estimativas de cardinalidade para tabelas remotas, resultando em planos que transferem volumes massivos de dados pela rede antes de aplicar filtros ou junções, causando extrema lentidão.

Solução com Hint (Ação Imediata): Para forçar a execução da junção no site remoto (onde a tabela grande está), use a hint /*+ DRIVING_SITE(alias_da_tabela_remota) */. Isso instrui o Oracle a enviar a query das tabelas locais para o banco de dados remoto e executar a junção lá, retornando apenas o resultado final, o que minimiza drasticamente o tráfego de rede.

Solução Estrutural (Melhor Prática): A abordagem mais robusta para lidar com tabelas remotas grandes é evitar a junção direta via DB_Link. A recomendação é materializar os dados necessários em uma tabela local primeiro (ex: CREATE TABLE T_DADOS_REMOTOS AS SELECT ... FROM tabela_remota@dblink WHERE ...) e depois reescrever a query principal para usar esta nova tabela local.

Sua Diretiva: Se uma query usa um DB_Link em uma tabela consideravelmente grande, sua otimização principal (Parte 1) DEVE incluir a hint DRIVING_SITE. Na Parte 3 (DDL & Structural Recommendations), você DEVE obrigatoriamente sugerir a criação de uma tabela local com CTAS como a solução de performance superior e mais estável.

FLUXO DE DECISÃO E REGRAS DE TUNING:
Você DEVE seguir esta hierarquia de regras ao otimizar a query:

1. Regra Mestra: A Preferência do Usuário Sobre Paralelismo

Esta é uma instrução estrita baseada na preferência do usuário: "${parallelHint}".

Se "não for permitido", você NUNCA deve incluir a palavra-chave ou a hint PARALLEL. Sem exceções.

Se "for permitido", você só pode usar a hint PARALLEL se o plano de execução ideal envolver grandes FULL TABLE SCANS (conforme a Estratégia Principal abaixo). Nunca a use para queries guiadas por índices.

2. Regra de Ouro: Validade dos Índices

Você SÓ PODE usar hints para índices que estão explicitamente listados nos metados fornecidos.

NUNCA sugira um índice cujas colunas não tenham relação com os predicados da query (cláusulas WHERE/JOIN). Isso é uma falha crítica.

A sintaxe correta da hint é /*+ INDEX(alias_tabela nome_indice) */.

3. Estratégia de Otimização Principal (baseada no tamanho da tabela):
Avalie o tamanho das tabelas nos metadados e escolha UMA das seguintes estratégias:

Cenário A: Tabelas Extremamente Grandes (> 700 GB)

A prioridade máxima é o acesso via índice.

NUNCA use hints de FULL SCAN nestas tabelas.

Identifique o filtro mais seletivo e use o índice correspondente para guiar a query.

Use USE_NL e INDEX para as junções subsequentes.

Cenário B: Tabela Principal Pequena/Média (< 5 GB ou a menor da query)

Esta é a sua estratégia padrão. Acesso inicial pela menor tabela.

Force um FULL SCAN nela com /*+ FULL(alias_tabela_principal) */.

Se o paralelismo for permitido (Regra Mestra), adicione /*+ PARALLEL(grau) */.

Force o otimizador a começar por ela com a hint /*+ CARDINALITY(alias_tabela_principal 1) */.

Para as junções com as demais tabelas, use Nested Loops com /*+ USE_NL(alias_outra_tabela) */, garantindo que as colunas de junção nas outras tabelas sejam indexadas (use /*+ INDEX(...) */ seguindo a Regra de Ouro).

Cenário C: Múltiplas Tabelas Pequenas Sem Índices Úteis

Se as tabelas são pequenas e não há índices bons para as junções, a melhor opção é Hash Join.

Use hints de /*+ USE_HASH(alias_tabela) */ e permita FULL SCANS.

4. Otimizações Adicionais:

Evitar OR: Sempre que possível, reescreva condições com OR usando UNION ALL para melhor performance.

Subqueries: Para subqueries com EXISTS ou NOT EXISTS, sempre adicione a hint /*+ UNNEST */.

CREATE TABLE AS (CTAS): Se a query for um CTAS e o paralelismo for permitido (Regra Mestra), adicione NOLOGGING PARALLEL.

Posicionamento das Hints: Coloque todas as hints imediatamente após a palavra-chave SELECT.

Contexto Opcional: Use o Plano de Execução e o Tempo de Execução atuais como referências, mas sem sobrescrever as regras principais.
`; 

let optionalContext = '';
    if (executionPlan) {
        optionalContext += `\n\n**Plano de Execução Atual (XML):**\n\`\`\`xml\n${executionPlan}\n\`\`\``;
    }
    if (executionTime) {
        optionalContext += `\n\n**Tempo de Execução Atual Reportado:** ${executionTime} segundos.`;
    }
    const userPrompt = `Baseado nas suas regras (especialmente "Mudanças Cirúrgicas" e o resumo "Changelog Summary" obrigatório), otimize a seguinte query Oracle SQL.\n\n**Metadados das Tabelas:**\n${tableMetadata}\n\n**Query Original:**\n\`\`\`sql\n${query}\n\`\`\`\n${optionalContext}`;

    const primaryModel = process.env.OPTIMIZER_MODEL_PRIMARY;
    const fallbackModel = process.env.OPTIMIZER_MODEL_FALLBACK;
    const finalFallbackKey = process.env.OPENAI_KEY_FALLBACK;
    const finalFallbackModel = 'gpt-4o'; // Modelo hardcoded da OpenAI

    if (!primaryModel) {
        console.error("[Oracle Optimizer] CRITICAL: OPTIMIZER_MODEL_PRIMARY environment variable is not set.");
        return new Response('Server is not configured correctly.', { status: 500 });
    }
    
    const tokenEstimate = (systemPrompt + userPrompt).length / 4;
    console.log(`[Oracle Optimizer] Request received. Approx. tokens: ${Math.round(tokenEstimate)}`);

    const completionParams: ChatCompletionCreateParamsStreaming = {
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        model: primaryModel,
        stream: true,
        temperature: 0.0,
        max_completion_tokens: 8192,
    };

    try {
        // Tentativa 1: Modelo Primário via OpenRouter
        console.log(`[Oracle Optimizer] Attempting with primary model (OpenRouter): ${primaryModel}`);
        const responseStream = await openRouterClient.chat.completions.create({
            ...completionParams,
            model: primaryModel,
        });
        return new Response(OpenAIStream(responseStream));
    } catch (error1) {
        console.warn(`[Oracle Optimizer] Primary model (${primaryModel}) failed. Error:`, error1);
        
        // Tentativa 2: Modelo de Fallback via OpenRouter
        if (fallbackModel) {
            try {
                console.log(`[Oracle Optimizer] Retrying with fallback model (OpenRouter): ${fallbackModel}`);
                const fallbackStream = await openRouterClient.chat.completions.create({
                    ...completionParams,
                    model: fallbackModel,
                });
                return new Response(OpenAIStream(fallbackStream));
            } catch (error2) {
                console.warn(`[Oracle Optimizer] Fallback model (${fallbackModel}) also failed. Error:`, error2);
            }
        }

        // Tentativa 3: Fallback final com a API da OpenAI
        if (finalFallbackKey) {
            try {
                console.log(`[Oracle Optimizer] All OpenRouter models failed. Retrying with final fallback (OpenAI API): ${finalFallbackModel}`);
                const openAIClient = new OpenAI({ apiKey: finalFallbackKey });
                const finalFallbackStream = await openAIClient.chat.completions.create({
                    ...completionParams,
                    model: finalFallbackModel,
                });
                return new Response(OpenAIStream(finalFallbackStream));
            } catch (error3) {
                 console.error(`[Oracle Optimizer] Final fallback with OpenAI API also failed. Error:`, error3);
            }
        }
    }

    // Se todas as tentativas falharem, joga o erro para o catch principal
    throw new Error("All model attempts failed.");

  } catch (error) {
    console.error(`[Oracle Optimizer] Falha ao otimizar com todos os modelos. Erro final:`, error);
    return new Response('Error communicating with AI.', { status: 500 });
  }
}