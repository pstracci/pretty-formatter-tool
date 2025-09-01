// src/app/api/optimize-oracle/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const runtime = 'edge';

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
    
    if (typeof tables === 'string' && tables.trim() !== '') {
      tableMetadata = `The user has provided the following metadata output from their database. Use this as the primary source of truth for table sizes, indexes, and structure:\n\n${tables}`;
    } else if (Array.isArray(tables) && tables.length > 0) {
      tableMetadata = tables.map((t: TableInfo) => 
        `- Table: ${t.name || 'N/A'}\n  Size: ${t.size || 'N/A'} GB\n  Approx. Columns: ${t.columns || 'N/A'}\n  Indexed Fields: ${t.indexes || 'None'}`
      ).join('\n');
    }

    const parallelHint = parallel.allowed
      ? `Parallel execution is allowed up to a degree of ${parallel.degree}.`
      : 'Parallel execution is not allowed.';
    
    const executeImmediateHint = isExecuteImmediate
      ? `**Special Instruction (Execute Immediate):** The user has indicated the query is a string from an \`EXECUTE IMMEDIATE\` block. You MUST first parse and reconstruct the clean, executable SQL from this string format (handling concatenations like '|| CHR(10) ||' and escaped quotes) before applying any optimization rules.`
      : '';

    const systemPrompt = `You are an expert Oracle Database Performance Tuning specialist. Your task is to rewrite a given SQL query for maximum performance, applying a specific set of expert rules. You must act as a senior DBA with deep knowledge of Oracle's cost-based optimizer.

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
      - **Rule 6.1 (Dealing with CREATE TABLE AS):** If the user has provided metadata that indicates the possibility of paralelism, CREATE TABLE AS commands must be incremented with \`NOLOGGING PARALLEL (DEGREE 'XYZ')\` clausules
	  - **Rule 7 (Parallelism):** The user's preference is: "${parallelHint}". You should interpret this as follows: You *may* use a parallel hint if the optimal plan involves large full table scans. However, for highly selective, index-driven queries (as guided by Rule 9), parallelism is often detrimental and **should be avoided**, even if allowed.
      - **Rule 8 (Correct Hint Placement):** This is a strict rule. All hints MUST be placed immediately after the \`SELECT\` keyword, in the format \`SELECT /*+ HINT_TEXT */ ...\`. If the query contains a \`UNION\` or \`UNION ALL\`, the hint must be placed inside each specific \`SELECT\` statement of the union that requires it, not at the end of the entire query.
      - **Rule 9 (The Master Plan):** Follow this thinking process:
          1. First, look at the \`WHERE\` clause. Identify the table with the most selective filter (the one that will return the fewest rows).
          2. Check the metadata for that table. Does an index exist on the filtered column? Your metadata contains a "Tuning_Advice" line for a reason.
          3. If yes, your primary strategy MUST be to use that index. Start your hints with \`/*+ INDEX(table_alias index_name) */\`.
          4. For all subsequent joins from this filtered table to other tables, use nested loops \`/*+ USE_NL(other_table) */\` and specify the index for the join key on the other table \`/*+ INDEX(other_table other_table_index) */\`.
          5. Only consider \`PARALLEL\` if your final plan does not use this index-driven strategy and relies on \`FULL\` scans.`;

    const userPrompt = `Based on the rules provided, optimize the following Oracle SQL query.

      **Table Metadata:**
      ${tableMetadata}
      
      **Original Query:**
      \`\`\`sql
      ${query}
      \`\`\`
      `;

    const { text } = await generateText({
      model: openai('gpt-4o'), // Upgraded model for better reasoning
      temperature: 0.0, // Set to 0 for deterministic, rule-following behavior
      system: systemPrompt,
      prompt: userPrompt,
    });

    const finalPromptForLogging = `#################### SYSTEM PROMPT ####################\n\n${systemPrompt}\n\n#################### USER PROMPT ####################\n\n${userPrompt}`;

    return NextResponse.json({ 
      optimizedQuery: text,
      finalPrompt: finalPromptForLogging,
    });

  } catch (error) {
    console.error('Error in API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}