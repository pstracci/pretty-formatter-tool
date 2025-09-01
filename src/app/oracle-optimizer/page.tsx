// src/app/oracle-optimizer/page.tsx

'use client';
import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { githubDark } from '@uiw/codemirror-theme-github';
import { Database, Zap, Loader, AlertTriangle, PlusCircle, XCircle, Wand2 } from 'lucide-react';
import Link from 'next/link';

interface TableInfo {
  id: number;
  name: string;
  size: string;
  columns: string;
  indexes: string;
}

export default function OracleOptimizerPage() {
  const [query, setQuery] = useState<string>('SELECT * FROM employees WHERE department_id = 10 OR department_id = 20;');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [allowParallel, setAllowParallel] = useState<boolean>(true);
  const [parallelDegree, setParallelDegree] = useState<string>('8');
  const [isExecuteImmediate, setIsExecuteImmediate] = useState<boolean>(false);
  
  const [executeImmediateString, setExecuteImmediateString] = useState<string>('');
  const [optimizedQuery, setOptimizedQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddTable = () => {
    setTables([...tables, { id: Date.now(), name: '', size: '', columns: '', indexes: '' }]);
  };

  const handleRemoveTable = (id: number) => {
    setTables(tables.filter(table => table.id !== id));
  };

  const handleTableChange = (id: number, field: keyof TableInfo, value: string) => {
    setTables(tables.map(table => table.id === id ? { ...table, [field]: value } : table));
  };

  const handleOptimize = async () => {
    setIsLoading(true);
    setError(null);
    setOptimizedQuery('');
    setExecuteImmediateString('');

    const payload = {
      query,
      tables,
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
            <h2 className="text-2xl font-semibold mb-4 text-cyan-400">1. Table Metadata (Optional)</h2>
            {tables.map((table) => (
              <div key={table.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-4 border border-gray-600 rounded-lg relative">
                <button onClick={() => handleRemoveTable(table.id)} className="absolute top-2 right-2 text-red-500 hover:text-red-400"><XCircle size={18}/></button>
                <input type="text" placeholder="Table Name (e.g., S_ASSET)" value={table.name} onChange={(e) => handleTableChange(table.id, 'name', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
                <input type="text" placeholder="Size in GB (e.g., 1000)" value={table.size} onChange={(e) => handleTableChange(table.id, 'size', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
                <input type="text" placeholder="Approx. Number of Columns (e.g., 70)" value={table.columns} onChange={(e) => handleTableChange(table.id, 'columns', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
                <input type="text" placeholder="Indexed Fields (e.g., row_id)" value={table.indexes} onChange={(e) => handleTableChange(table.id, 'indexes', e.target.value)} className="bg-gray-700 p-2 rounded text-sm"/>
              </div>
            ))}
            <button onClick={handleAddTable} className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"><PlusCircle size={16}/> Add Table Info</button>
            <h2 className="text-2xl font-semibold mt-8 mb-4 text-cyan-400">2. Other Options</h2>
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
                  height="650px"
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