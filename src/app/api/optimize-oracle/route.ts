// src/app/api/optimize-oracle/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const runtime = 'edge';

// ✨ CORREÇÃO: Definindo um tipo para a informação da tabela ✨
interface TableInfo {
  name: string;
  size: string;
  columns: string;
  indexes: string;
}

export async function POST(req: NextRequest) {
  try {
    const { query, tables, parallel, isExecuteImmediate } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
    }

    let tableMetadata = 'No specific table metadata provided.';
    if (tables && tables.length > 0) {
      // ✨ CORREÇÃO: Usando o tipo TableInfo em vez de 'any' ✨
      tableMetadata = tables.map((t: TableInfo) => 
        `- Table: ${t.name || 'N/A'}\n  Size: ${t.size || 'N/A'} GB\n  Approx. Columns: ${t.columns || 'N/A'}\n  Indexed Fields: ${t.indexes || 'None'}`
      ).join('\n');
    }

    const parallelHint = parallel.allowed
      ? `Parallel execution is allowed up to a degree of ${parallel.degree}. Use /*+ PARALLEL(${parallel.degree}) */ hint where appropriate.`
      : 'Parallel execution is not allowed.';
    
    const executeImmediateHint = isExecuteImmediate
      ? `**Special Instruction (Execute Immediate):** The user has indicated the query is a string from an \`EXECUTE IMMEDIATE\` block. You MUST first parse and reconstruct the clean, executable SQL from this string format (handling concatenations like '|| CHR(10) ||' and escaped quotes) before applying any optimization rules.`
      : '';

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      temperature: 0.1,
      system: `You are an expert Oracle Database Performance Tuning specialist. Your task is to rewrite a given SQL query for maximum performance, applying a specific set of expert rules. You must act as a senior DBA with deep knowledge of Oracle's cost-based optimizer.

      **General Directives:**
      ${executeImmediateHint}
      1.  **Crucial - Semantic Equivalence:** Your primary goal is performance, but the optimized query MUST produce the exact same result set as the original query under all data conditions. Do not change join types (e.g., from INNER to LEFT) unless the original syntax (like Oracle's \`(+)\`) is a non-standard representation of that join type. The conversion from Oracle's old \`(+)\` join syntax to the modern ANSI \`LEFT JOIN\` or \`RIGHT JOIN\` is acceptable and encouraged as it improves readability without changing the logic.
      2.  The output MUST BE ONLY the optimized SQL query. Do not include explanations, introductions, or markdown code fences (\`\`\`).

      **Expert Tuning Rules:**
      - **Rule 1 (Small Main Table Joins):** If the main table in a join is small (e.g., less than 5 GB) AND there are indexed fields for the join conditions on the other tables, you should strongly consider forcing a full table scan on the main table using the \`/*+ FULL(table_alias) */\` hint and nested loops for the joins using \`/*+ USE_NL(other_table_alias) */\`. You can also use the \`CARDINALITY\` hint to guide the optimizer.
      - **Rule 2 (Small Tables, No Indexes):** If all tables involved are small and lack useful indexes for joins, rewrite the query to use hash joins with \`/*+ USE_HASH(table_alias) */\` and full table scans on all.
      - **Rule 3 (Extremely Large Tables):** If a table's metadata indicates it is extremely large (e.g., over 700 GB), you must prioritize an index-based access path. **Never** use a \`/*+ FULL(table_alias) */\` hint on such a table, as a full scan would be catastrophic for performance. Your main goal becomes avoiding a full table scan on this table at all costs.
      - **Rule 4 (Avoid 'OR'):** The \`OR\` clause on different columns is often inefficient. If you encounter an \`OR\` clause, rewrite the query to use a \`UNION ALL\` structure, where each part of the union handles one of the original conditions.
      - **Rule 5 (Window Functions):** If you see a query accessing the same table multiple times just to get a maximum value within a group (e.g., using a subquery with MAX and joining back), you should prioritize rewriting it using window functions like \`MAX(...) OVER (PARTITION BY ...)\` to access the table only once.
      - **Rule 6 (Freedom to Optimize):** If the user does not provide any table metadata (size, indexes), you have the freedom to optimize the query based on its structure alone, applying general best practices. The rules above are your primary guide when metadata is available.
      - **Rule 7 (Parallelism):** Adhere to the user's preference for parallel execution. ${parallelHint}
      - **Rule 8 (Correct Hint Placement):** This is a strict rule. All hints MUST be placed immediately after the \`SELECT\` keyword, in the format \`SELECT /*+ HINT_TEXT */ ...\`. If the query contains a \`UNION\` or \`UNION ALL\`, the hint must be placed inside each specific \`SELECT\` statement of the union that requires it, not at the end of the entire query.`,
      prompt: `Based on the rules provided, optimize the following Oracle SQL query.

      **Table Metadata:**
      ${tableMetadata}
      
      **Original Query:**
      \`\`\`sql
      ${query}
      \`\`\`
      `,
    });

    return NextResponse.json({ optimizedQuery: text });

  } catch (error) {
    console.error('Error in API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}