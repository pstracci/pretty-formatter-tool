// src/app/oracle-optimizer/page.tsx

'use client';
import { useState, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { githubDark } from '@uiw/codemirror-theme-github';
import { Database, Zap, Loader, AlertTriangle, PlusCircle, XCircle, Wand2, UploadCloud, Clipboard, Check, Square, Eraser } from 'lucide-react';
import Link from 'next/link';

interface TableInfo {
  id: number;
  name: string;
  size: string;
  columns: string;
  indexes: string;
}

const DEFAULT_QUERY = 'SELECT e.first_name, d.department_name FROM employees e JOIN departments d ON e.department_id = d.department_id WHERE e.salary > 50000;';

export default function OracleOptimizerPage() {
  const [query, setQuery] = useState<string>(DEFAULT_QUERY);
  const [queryError, setQueryError] = useState<string | null>(null); 
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [allowParallel, setAllowParallel] = useState<boolean>(true);
  const [parallelDegree, setParallelDegree] = useState<string>('8');
  const [isExecuteImmediate, setIsExecuteImmediate] = useState<boolean>(false);
  
  const [executeImmediateString, setExecuteImmediateString] = useState<string>('');
  const [optimizedQuery, setOptimizedQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [metadataTableNames, setMetadataTableNames] = useState<string>('EMPLOYEES, DEPARTMENTS');
  const [generatedMetadataQuery, setGeneratedMetadataQuery] = useState<string>('');
  const [metadataFileContent, setMetadataFileContent] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const [executionPlan, setExecutionPlan] = useState<string | null>(null);
  const [xmlFileName, setXmlFileName] = useState<string>('');
  const [xmlError, setXmlError] = useState<string>('');
  const [executionTime, setExecutionTime] = useState<string>('');
  
  const [optimizationSummary, setOptimizationSummary] = useState<string>('');
  const [isInputPristine, setIsInputPristine] = useState<boolean>(true);
  
  // ADIÇÃO 1: Estado para a "key" do editor, para forçar sua recriação.
  const [editorKey, setEditorKey] = useState(Date.now());

  const abortControllerRef = useRef<AbortController | null>(null);
  const metadataFileRef = useRef<HTMLInputElement>(null);
  const xmlFileRef = useRef<HTMLInputElement>(null);


  const handleAddTable = () => setTables([...tables, { id: Date.now(), name: '', size: '', columns: '', indexes: '' }]);
  const handleRemoveTable = (id: number) => setTables(tables.filter(table => table.id !== id));
  const handleTableChange = (id: number, field: keyof TableInfo, value: string) => setTables(tables.map(table => table.id === id ? { ...table, [field]: value } : table));
  
  const handleQueryChange = (value: string) => {
    const lineCount = value.split('\n').length;
    if (lineCount <= 400) {
      setQuery(value);
      setQueryError(null);
    } else {
      setQueryError('Query cannot exceed 400 lines.');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const content = await file.text();
        setMetadataFileContent(content);
        setUploadedFileName(file.name);
      } catch (err) {
        setError("Failed to read the uploaded file.");
        setMetadataFileContent(null);
        setUploadedFileName('');
      }
    }
  };

  const handleXmlFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setXmlError('');
    setExecutionPlan(null);
    setXmlFileName('');

    if (file) {
      if (file.type !== 'text/xml' && !file.name.toLowerCase().endsWith('.xml')) {
        setXmlError('Error: File must be an XML.');
        return;
      }
      if (file.size > 1024 * 1024) {
        setXmlError('Error: File must be smaller than 1MB.');
        return;
      }
      try {
        const content = await file.text();
        setExecutionPlan(content);
        setXmlFileName(file.name);
      } catch (err) {
        setXmlError("Failed to read the XML file.");
      }
    }
  };

  const handleRemoveMetadataFile = () => {
    setMetadataFileContent(null);
    setUploadedFileName('');
    if (metadataFileRef.current) {
      metadataFileRef.current.value = '';
    }
  };
  const handleRemoveXmlFile = () => {
    setExecutionPlan(null);
    setXmlFileName('');
    setXmlError('');
    if (xmlFileRef.current) {
      xmlFileRef.current.value = '';
    }
  };

  const generateMetadataQuery = () => {
    const query = `
WITH
  input_tables AS (
    SELECT
      UPPER(
        TRIM(
          REGEXP_SUBSTR('${metadataTableNames}', '[^,]+', 1, LEVEL)
        )
      ) AS table_name
    FROM
      dual
    CONNECT BY
      LEVEL <= REGEXP_COUNT('${metadataTableNames}', ',') + 1
  ),
  table_sizes AS (
    SELECT
      segment_name AS table_name,
      ROUND(SUM(bytes) / 1024 / 1024 / 1024, 2) AS size_gb
    FROM
      USER_SEGMENTS
    WHERE
      segment_name IN (
        SELECT
          table_name
        FROM
          input_tables
      )
      AND segment_type LIKE 'TABLE%'
    GROUP BY
      segment_name
  ),
  index_summary AS (
    SELECT
      i.table_name,
      XMLAGG(
        XMLElement(
          "e",
          '    - ' || i.index_name || ' | Columns: (' || ic.column_list || ')' || CHR(10)
        )
        ORDER BY
          i.index_name
      )
      .extract('//text()')
      .getClobVal() AS index_details
    FROM
      USER_INDEXES i
      JOIN (
        SELECT
          index_name,
          table_name,
          LISTAGG(column_name, ', ') WITHIN GROUP (
            ORDER BY
              column_position
          ) as column_list
        FROM
          USER_IND_COLUMNS
        WHERE
          table_name IN (
            SELECT
              table_name
            FROM
              input_tables
          )
        GROUP BY
          index_name,
          table_name
      ) ic ON i.index_name = ic.index_name
    GROUP BY
      i.table_name
  ),
  table_profiles AS (
    SELECT
      t.table_name,
      '--------------------------------------------------------------------------------' || CHR(10) || '-- TABLE PROFILE: ' || t.table_name || CHR(10) || '--------------------------------------------------------------------------------' || CHR(10) || '  - Size_GB: ' || NVL(ts.size_gb, 0) || CHR(10) || '  - Estimated_Rows: ' || t.num_rows || CHR(10) || '  - Is_Partitioned: ' || t.partitioned || CHR(10) || '  - Tuning_Advice: ' || CASE
        WHEN NVL(ts.size_gb, 0) > 700 THEN 'Extremely large table. AVOID FULL TABLE SCAN AT ALL COSTS. Use index.'
        WHEN NVL(ts.size_gb, 0) < 1 THEN 'Small table. FULL TABLE SCAN is acceptable and can be efficient.'
        ELSE 'Medium size table. Evaluate filters to decide between FULL SCAN and INDEX SCAN.'
      END || CHR(10) || '  - Available_Indexes:' || CHR(10) || NVL(idx.index_details, '    - No indexes found.') AS formatted_profile
    FROM
      USER_TABLES t
      LEFT JOIN table_sizes ts ON t.table_name = ts.table_name
      LEFT JOIN index_summary idx ON t.table_name = idx.table_name
    WHERE
      t.table_name IN (
        SELECT
          table_name
        FROM
          input_tables
      )
  )
SELECT
  XMLAGG(
    XMLElement(
      "p",
      formatted_profile || CHR(10) || CHR(10)
    )
    ORDER BY
      table_name
  )
  .extract('//text()')
  .getClobVal()
FROM
  table_profiles
    `.trim();
    setGeneratedMetadataQuery(query);
  };
  
  const handleCopyToClipboard = () => {
    if (generatedMetadataQuery) {
      navigator.clipboard.writeText(generatedMetadataQuery);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleCopyOptimizedQuery = () => {
    if (!optimizedQuery) return;
    navigator.clipboard.writeText(optimizedQuery);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleOptimize = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setOptimizedQuery('');
    setExecuteImmediateString('');
    setOptimizationSummary('');

    const payload = {
      query,
      tables: metadataFileContent ? metadataFileContent : tables,
      parallel: {
        allowed: allowParallel,
        degree: allowParallel ? parallelDegree : '1',
      },
      isExecuteImmediate: isExecuteImmediate,
      executionPlan: executionPlan,
      executionTime: executionTime,
    };

    try {
      const response = await fetch('/api/optimize-oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('Response body is empty.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedResponse = '';
      const separator = '---OPTIMIZATION_SUMMARY---';
      let summaryStarted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        accumulatedResponse += chunk;

        if (!summaryStarted && accumulatedResponse.includes(separator)) {
          const parts = accumulatedResponse.split(separator);
          setOptimizedQuery(parts[0].trim());
          setOptimizationSummary(parts[1] || '');
          summaryStarted = true;
        } else {
          if (summaryStarted) {
            setOptimizationSummary(prev => prev + chunk);
          } else {
            setOptimizedQuery(accumulatedResponse);
          }
        }
      }
    
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Stream aborted by user.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while optimizing.');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // ADIÇÃO 2: Função "Clean" corrigida para resetar o editor.
  const handleClean = () => {
    setQuery('');
    setQueryError(null);
    setIsInputPristine(false);
    setEditorKey(Date.now()); // Força a recriação do componente CodeMirror
  };
  
  const handleQueryInputFocus = () => {
    if (isInputPristine) {
      setQuery('');
      setIsInputPristine(false);
    }
  };

  const convertToExecuteImmediate = () => {
    if (!optimizedQuery) return;
    const formatted = optimizedQuery
      .split('\n')
      .map(line => `'${line.replace(/'/g, "''")}' || CHR(10) ||`)
      .join('\n');
    
    const finalString = formatted.endsWith(" || CHR(10) ||") ? formatted.slice(0, -15) : formatted;
    setExecuteImmediateString(`EXECUTE IMMEDIATE \n${finalString};`);
  };

  return (
    <div className="min-h-screen font-sans bg-gradient-to-br from-gray-900 to-slate-800 text-white flex flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-7xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4">
            <Database size={40} className="text-cyan-400" />
            <h1 className="text-4xl font-bold">Oracle Query Optimizer</h1>
          </div>
          <p className="text-lg text-gray-400 mt-2">AI-powered tuning with expert rules</p>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mt-4 inline-block">&larr; Back to AI Formatter</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <h2 className="text-2xl font-semibold mb-4 text-cyan-400">1. Generate and Provide Table Metadata</h2>
            <div className="space-y-4">
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <p className="font-bold text-lg text-emerald-300">Option A: Generate Metadata Query</p>
                <p className="text-sm text-gray-400 mb-3">Enter the most important tables from your query (comma-separated) to generate a SQL script. Run the script in your database and upload the result.</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="e.g., EMPLOYEES, DEPARTMENTS" value={metadataTableNames} onChange={(e) => setMetadataTableNames(e.target.value)} className="bg-gray-700 p-2 rounded text-sm w-full"/>
                  <button onClick={generateMetadataQuery} className="bg-cyan-700 hover:bg-cyan-800 p-2 rounded text-sm font-semibold">Generate Query</button>
                </div>
                {generatedMetadataQuery && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-md font-semibold">Generated Query:</h3>
                        <button onClick={handleCopyToClipboard} className="flex items-center gap-2 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded transition-colors">
                            {isCopied ? <Check size={14} className="text-emerald-400"/> : <Clipboard size={14} />}
                            {isCopied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <div className="border border-gray-600 rounded-lg overflow-hidden">
                       <CodeMirror value={generatedMetadataQuery} height="300px" extensions={[sql()]} readOnly={true} theme={githubDark} />
                    </div>
                     <div className="mt-4">
                      <h3 className="text-md font-semibold mb-2">Upload Metadata File:</h3>
                      <div className="flex items-center gap-2">
                        <label className="w-full flex items-center justify-center gap-3 text-sm font-semibold bg-gray-700 hover:bg-gray-600 p-3 rounded-lg transition-colors cursor-pointer">
                            <UploadCloud size={18} />
                            {uploadedFileName ? `File: ${uploadedFileName}` : "Choose a file..."}
                            <input type="file" ref={metadataFileRef} className="hidden" onChange={handleFileChange} accept=".txt,.csv,.json,.xml" />
                        </label>
                        {uploadedFileName && (
                            <button onClick={handleRemoveMetadataFile} className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors" title="Remove file">
                                <XCircle size={18} />
                            </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <h2 className="text-2xl font-semibold mt-8 mb-4 text-cyan-400">2. Tuning Options</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allowParallel} onChange={(e) => setAllowParallel(e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-700 border-gray-600 rounded text-cyan-500 focus:ring-cyan-600"/>
                  <span>Allow `parallel` hint?</span>
                </label>
                {allowParallel && (<input type="number" value={parallelDegree} onChange={(e) => setParallelDegree(e.target.value)} className="bg-gray-700 p-2 rounded w-20 text-sm" placeholder="Degree"/>)}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isExecuteImmediate} onChange={(e) => setIsExecuteImmediate(e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-700 border-gray-600 rounded text-cyan-500 focus:ring-cyan-600"/>
                <span>Query is an `EXECUTE IMMEDIATE` string</span>
              </label>
            </div>
            
            <h3 className="text-xl font-semibold mt-6 mb-3 text-cyan-400">3. Optional Context</h3>
            <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <div>
                    <label htmlFor="executionTime" className="text-sm font-semibold text-gray-300 mb-2 block">Current Execution Time (seconds)</label>
                    <input type="number" id="executionTime" value={executionTime} onChange={(e) => setExecutionTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-sm" placeholder="e.g., 120"/>
                </div>
                <div>
                    <label className="text-sm font-semibold text-gray-300 mb-2 block">Upload Execution Plan (XML, &lt; 1MB)</label>
                    <div className="flex items-center gap-2">
                        <label className="w-full flex items-center justify-center gap-3 text-sm font-semibold bg-gray-700 hover:bg-gray-600 p-3 rounded-lg transition-colors cursor-pointer">
                            <UploadCloud size={18} />
                            {xmlFileName ? `File: ${xmlFileName}` : "Choose XML file..."}
                            <input type="file" ref={xmlFileRef} className="hidden" onChange={handleXmlFileChange} accept="text/xml,.xml" />
                        </label>
                        {xmlFileName && (
                            <button onClick={handleRemoveXmlFile} className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors" title="Remove file">
                                <XCircle size={18} />
                            </button>
                        )}
                    </div>
                    {xmlError && <p className="text-red-400 text-xs mt-2">{xmlError}</p>}
                </div>
            </div>
            
            <div className="flex justify-between items-center mt-8 mb-4">
                <h2 className="text-2xl font-semibold text-cyan-400">4. Query to Optimize</h2>
                <button onClick={handleClean} className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded transition-colors" title="Clear content">
                    <Eraser size={14}/> Clean
                </button>
            </div>
            <div className="border border-gray-600 rounded-lg overflow-hidden">
                {/* ADIÇÃO 3: Propriedade "key" para forçar o reset do componente. */}
                <CodeMirror key={editorKey} value={query} height="200px" extensions={[sql()]} onChange={handleQueryChange} onFocus={handleQueryInputFocus} theme={githubDark} />
            </div>
            {queryError && (
              <p className="text-red-400 text-sm mt-2">{queryError}</p>
            )}
            <button onClick={handleOptimize} disabled={isLoading || !query} className="w-full mt-6 flex items-center justify-center gap-3 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 p-3 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
              <Zap size={20}/>{isLoading ? 'Optimizing...' : 'Optimize Query'}
            </button>
          </div>

          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-semibold text-cyan-400">Optimized Query</h2>
                    {isLoading && (
                        <div className="flex items-center gap-4">
                        <Loader className="animate-spin text-cyan-400" />
                        <button onClick={handleStopStreaming} className="flex items-center gap-2 px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors">
                            <Square size={12} fill="currentColor" />
                            Stop
                        </button>
                        </div>
                    )}
                </div>
                <button onClick={handleCopyOptimizedQuery} className="flex items-center gap-2 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded transition-colors disabled:opacity-50" disabled={!optimizedQuery || isLoading}>
                    {copySuccess ? <Check size={14} className="text-emerald-400"/> : <Clipboard size={14} />}
                    {copySuccess ? 'Copied!' : 'Copy'}
                </button>
            </div>
            
            <div className="border border-gray-600 rounded-lg overflow-hidden">
                <CodeMirror
                  value={optimizedQuery}
                  height="450px"
                  extensions={[sql()]}
                  readOnly={true}
                  theme={githubDark}
                />
            </div>

            {optimizationSummary && !isLoading && (
              <div className="mt-4 p-4 bg-gray-900/50 border border-gray-700 rounded-lg flex-shrink-0">
                <h3 className="text-lg font-semibold text-cyan-400 mb-3">Optimization Summary</h3>
                <div className="text-sm text-gray-300 space-y-2">
                  {optimizationSummary.split('\n').map((line, index) => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
                      return <p key={index} className="font-bold text-gray-100 mt-2">{trimmedLine.replace(/\*\*/g, '')}</p>;
                    }
                    if (trimmedLine.startsWith('-')) {
                      return <li key={index} className="ml-4 list-disc">{trimmedLine.substring(1).trim()}</li>;
                    }
                    return line ? <p key={index}>{line}</p> : null;
                  })}
                </div>
              </div>
            )}
            
            {optimizedQuery && !isLoading && (
              <div className="mt-4 flex-shrink-0">
                <button onClick={convertToExecuteImmediate} className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-cyan-700 hover:bg-cyan-800 p-2 rounded-lg transition-colors">
                  <Wand2 size={16}/> Convert to `EXECUTE IMMEDIATE` string
                </button>
                
                {executeImmediateString && (
                  <details className="mt-4" open>
                    <summary className="cursor-pointer text-sm font-semibold text-gray-400 hover:text-white">
                      View EXECUTE IMMEDIATE String
                    </summary>
                    <div className="mt-2 border border-gray-600 rounded-lg overflow-hidden">
                      <CodeMirror 
                        value={executeImmediateString}
                        height="300px" 
                        extensions={[sql()]}
                        readOnly={true} 
                        theme={githubDark} 
                      />
                    </div>
                  </details>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg flex-shrink-0">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle/> Error</div><p className="text-sm mt-2">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}