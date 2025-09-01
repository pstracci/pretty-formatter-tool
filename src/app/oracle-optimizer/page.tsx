// src/app/oracle-optimizer/page.tsx

'use client';
import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { githubDark } from '@uiw/codemirror-theme-github';
import { Database, Zap, Loader, AlertTriangle, PlusCircle, XCircle, Wand2, UploadCloud, Clipboard, Check } from 'lucide-react';
import Link from 'next/link';

interface TableInfo {
  id: number;
  name: string;
  size: string;
  columns: string;
  indexes: string;
}

export default function OracleOptimizerPage() {
  const [query, setQuery] = useState<string>('SELECT e.first_name, d.department_name FROM employees e JOIN departments d ON e.department_id = d.department_id WHERE e.salary > 50000;');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [allowParallel, setAllowParallel] = useState<boolean>(true);
  const [parallelDegree, setParallelDegree] = useState<string>('8');
  const [isExecuteImmediate, setIsExecuteImmediate] = useState<boolean>(false);
  
  const [executeImmediateString, setExecuteImmediateString] = useState<string>('');
  const [optimizedQuery, setOptimizedQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New states
  const [metadataTableNames, setMetadataTableNames] = useState<string>('EMPLOYEES, DEPARTMENTS');
  const [generatedMetadataQuery, setGeneratedMetadataQuery] = useState<string>('');
  const [metadataFileContent, setMetadataFileContent] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  // The final prompt state is no longer needed for the UI
  // const [finalPrompt, setFinalPrompt] = useState<string>(''); 


  const handleAddTable = () => {
    setTables([...tables, { id: Date.now(), name: '', size: '', columns: '', indexes: '' }]);
  };

  const handleRemoveTable = (id: number) => {
    setTables(tables.filter(table => table.id !== id));
  };

  const handleTableChange = (id: number, field: keyof TableInfo, value: string) => {
    setTables(tables.map(table => table.id === id ? { ...table, [field]: value } : table));
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

  const generateMetadataQuery = () => {
    const query = `
WITH
  input_tables AS (
    SELECT
      UPPER(TRIM(REGEXP_SUBSTR('${metadataTableNames}', '[^,]+', 1, LEVEL))) AS table_name
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
      segment_name IN (SELECT table_name FROM input_tables)
      AND segment_type LIKE 'TABLE%'
    GROUP BY
      segment_name
  ),
  index_summary AS (
    SELECT
      i.table_name,
      XMLAGG(XMLElement("i", '    - ' || i.index_name || ' | Columns: (' || ic.column_list || ')' || CHR(10)) ORDER BY i.index_name).getClobVal() AS index_details
    FROM
      USER_INDEXES i
      JOIN (
        SELECT
          index_name,
          LISTAGG(column_name, ', ') WITHIN GROUP (ORDER BY column_position) AS column_list
        FROM
          USER_IND_COLUMNS
        GROUP BY
          index_name
      ) ic ON i.index_name = ic.index_name
    WHERE
      i.table_name IN (SELECT table_name FROM input_tables)
    GROUP BY
      i.table_name
  ),
  table_profiles AS (
    SELECT
      t.table_name,
      '--------------------------------------------------------------------------------' || CHR(10) ||
      '-- TABLE PROFILE: ' || t.table_name || CHR(10) ||
      '--------------------------------------------------------------------------------' || CHR(10) ||
      '  - Size_GB: ' || NVL(ts.size_gb, 0) || CHR(10) ||
      '  - Estimated_Rows: ' || t.num_rows || CHR(10) ||
      '  - Is_Partitioned: ' || t.partitioned || CHR(10) ||
      '  - Tuning_Advice: ' ||
        CASE
          WHEN NVL(ts.size_gb, 0) > 700 THEN 'Extremely large table. AVOID FULL TABLE SCAN AT ALL COSTS. Use index.'
          WHEN NVL(ts.size_gb, 0) < 1 THEN 'Small table. FULL TABLE SCAN is acceptable and can be efficient.'
          ELSE 'Medium size table. Evaluate filters to decide between FULL SCAN and INDEX SCAN.'
        END || CHR(10) ||
      '  - Available_Indexes:' || CHR(10) ||
      NVL(idx.index_details, '    - No indexes found.') AS formatted_profile
    FROM
      USER_TABLES t
      LEFT JOIN table_sizes ts ON t.table_name = ts.table_name
      LEFT JOIN index_summary idx ON t.table_name = idx.table_name
    WHERE
      t.table_name IN (SELECT table_name FROM input_tables)
  )
SELECT
  REGEXP_REPLACE(XMLAGG(XMLElement("p", formatted_profile || CHR(10)) ORDER BY table_name).getClobVal(), '<[^>]+>', '')
FROM
  table_profiles;
    `.trim();
    setGeneratedMetadataQuery(query);
  };
  
  const handleCopyToClipboard = () => {
    if (generatedMetadataQuery) {
      navigator.clipboard.writeText(generatedMetadataQuery);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    }
  };


  const handleOptimize = async () => {
    setIsLoading(true);
    setError(null);
    setOptimizedQuery('');
    setExecuteImmediateString('');

    const payload = {
      query,
      tables: metadataFileContent ? metadataFileContent : tables,
      parallel: {
        allowed: allowParallel,
        degree: allowParallel ? parallelDegree : '1',
      },
      isExecuteImmediate: isExecuteImmediate,
    };

    try {
      const response = await fetch('/api/optimize-oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const data = await response.json();
      setOptimizedQuery(data.optimizedQuery);
      // The final prompt is no longer displayed, so no need to set its state
      // setFinalPrompt(data.finalPrompt);
    
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred. Check the console.');
      }
    } finally {
      setIsLoading(false);
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
                <p className="text-sm text-gray-400 mb-3">Enter the tables from your query (comma-separated) to generate a SQL script. Run the script in your database and upload the result.</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="e.g., EMPLOYEES, DEPARTMENTS" value={metadataTableNames} onChange={(e) => setMetadataTableNames(e.target.value)} className="bg-gray-700 p-2 rounded text-sm w-full"/>
                  <button onClick={generateMetadataQuery} className="bg-cyan-700 hover:bg-cyan-800 p-2 rounded text-sm font-semibold">Generate Query</button>
                </div>
                {generatedMetadataQuery && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-md font-semibold">Generated Query (Copy and run in your database):</h3>
                        <button onClick={handleCopyToClipboard} className="flex items-center gap-2 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded transition-colors">
                            {isCopied ? <Check size={14} className="text-emerald-400"/> : <Clipboard size={14} />}
                            {isCopied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <div className="border border-gray-600 rounded-lg overflow-hidden">
                       <CodeMirror value={generatedMetadataQuery} height="300px" extensions={[sql()]} readOnly={true} theme={githubDark} />
                    </div>
                     <div className="mt-4">
                      <h3 className="text-md font-semibold mb-2">Upload the result file (txt, csv, etc.):</h3>
                      <label className="w-full flex items-center justify-center gap-3 text-sm font-semibold bg-gray-700 hover:bg-gray-600 p-3 rounded-lg transition-colors cursor-pointer">
                        <UploadCloud size={18} />
                        {uploadedFileName ? `File: ${uploadedFileName}` : "Choose a file..."}
                        <input type="file" className="hidden" onChange={handleFileChange} accept=".txt,.csv,.json,.xml" />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center font-bold text-gray-400">OR</div>

              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <p className="font-bold text-lg text-emerald-300">Option B: Enter Metadata Manually</p>
                {tables.map((table) => (
                  <div key={table.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4 p-4 border border-gray-600 rounded-lg relative">
                    <button onClick={() => handleRemoveTable(table.id)} className="absolute top-2 right-2 text-red-500 hover:text-red-400"><XCircle size={18}/></button>
                    <input type="text" placeholder="Table Name (e.g., EMPLOYEES)" value={table.name} onChange={(e) => handleTableChange(table.id, 'name', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
                    <input type="text" placeholder="Size in GB (e.g., 10)" value={table.size} onChange={(e) => handleTableChange(table.id, 'size', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
                    <input type="text" placeholder="Approx. Number of Columns (e.g., 15)" value={table.columns} onChange={(e) => handleTableChange(table.id, 'columns', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
                    <input type="text" placeholder="Indexed Fields (e.g., employee_id)" value={table.indexes} onChange={(e) => handleTableChange(table.id, 'indexes', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
                  </div>
                ))}
                <button onClick={handleAddTable} className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"><PlusCircle size={16}/> Add Table</button>
              </div>
            </div>

            <h2 className="text-2xl font-semibold mt-8 mb-4 text-cyan-400">2. Tuning Options</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isExecuteImmediate} onChange={(e) => setIsExecuteImmediate(e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-700 border-gray-600 rounded text-cyan-500 focus:ring-cyan-600"/>
                <span>Query is an `EXECUTE IMMEDIATE` string</span>
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allowParallel} onChange={(e) => setAllowParallel(e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-700 border-gray-600 rounded text-cyan-500 focus:ring-cyan-600"/>
                  <span>Allow `parallel` hint?</span>
                </label>
                {allowParallel && (<input type="number" value={parallelDegree} onChange={(e) => setParallelDegree(e.target.value)} className="bg-gray-700 p-2 rounded w-20 text-sm" placeholder="Degree"/>)}
              </div>
            </div>
            <h2 className="text-2xl font-semibold mt-8 mb-4 text-cyan-400">3. Query to Optimize</h2>
            <div className="border border-gray-600 rounded-lg overflow-hidden">
                <CodeMirror value={query} height="300px" extensions={[sql()]} onChange={(value) => setQuery(value)} theme={githubDark} />
            </div>
            <button onClick={handleOptimize} disabled={isLoading || !query} className="w-full mt-6 flex items-center justify-center gap-3 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 p-3 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
              <Zap size={20}/>{isLoading ? 'Optimizing...' : 'Optimize Query'}
            </button>
          </div>

          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-cyan-400">Optimized Query</h2>
                {isLoading && <Loader className="animate-spin text-cyan-400" />}
            </div>
            <div className="border border-gray-600 rounded-lg overflow-hidden flex-grow">
                <CodeMirror
                  value={optimizedQuery}
                  height="950px"
                  extensions={[sql()]}
                  readOnly={true}
                  theme={githubDark}
                />
            </div>
            {optimizedQuery && !isLoading && (
              <div className="mt-4">
                <button onClick={convertToExecuteImmediate} className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-cyan-700 hover:bg-cyan-800 p-2 rounded-lg transition-colors">
                  <Wand2 size={16}/> Convert to `EXECUTE IMMEDIATE` string
                </button>
                {executeImmediateString && (<div className="mt-4 border border-gray-600 rounded-lg overflow-hidden"><CodeMirror value={executeImmediateString} extensions={[sql()]} readOnly={true} theme={githubDark}/></div>)}
              </div>
            )}
            {/* The final prompt section has been removed */}
            {error && (
              <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle/> Error</div><p className="text-sm mt-2">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}