// src/app/oracle-query-cleaner/page.tsx

'use client';
import { useState, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { githubDark } from '@uiw/codemirror-theme-github';
import { FileCode, Copy, Check, Loader, AlertTriangle, Eraser, Square, Wand2 } from 'lucide-react';
import Link from 'next/link';

const PLACEHOLDER_TEXT = "-- Cole aqui sua string 'EXECUTE IMMEDIATE' ou uma query SQL limpa...";

export default function OracleQueryCleanerPage() {
  const [inputQuery, setInputQuery] = useState<string>(PLACEHOLDER_TEXT);
  const [outputQuery, setOutputQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  const [cleaningDirection, setCleaningDirection] = useState<'clean' | 'prepare'>('clean');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isPristine, setIsPristine] = useState<boolean>(true);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const processQuery = useCallback(async () => {
    if (isPristine || !inputQuery || inputQuery.trim() === '') return;
    if (abortControllerRef.current) abortControllerRef.current.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError('');
    setOutputQuery('');

    try {
      const response = await fetch('/api/oracle-query-cleaner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: inputQuery, direction: cleaningDirection }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      if (!response.body) throw new Error('Response body is empty.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setOutputQuery((prev) => prev + chunk);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Processing aborted by user.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An error occurred while processing the query.');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [inputQuery, cleaningDirection, isPristine]);

  const handleFocus = () => { if (isPristine) { setInputQuery(''); setIsPristine(false); } };
  const handleCopy = () => { if (!outputQuery) return; navigator.clipboard.writeText(outputQuery); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); };
  const handleStopStreaming = () => abortControllerRef.current?.abort();

  const handleCleanInput = () => {
    handleStopStreaming();
    setInputQuery('');
    setError('');
    setIsPristine(false);
  };
  
  const handleCleanOutput = () => {
     setOutputQuery('');
  }

  return (
    <div className="min-h-screen font-sans bg-gradient-to-br from-gray-900 to-slate-800 text-white flex flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-7xl">
        
        <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-4">
                <FileCode size={40} className="text-emerald-400" />
                <h1 className="text-4xl font-bold">Oracle Query Cleaner</h1>
            </div>
            <p className="text-lg text-gray-400 mt-2">Clean or Prepare EXECUTE IMMEDIATE strings</p>
            <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mt-4 inline-block">&larr; Back to All Tools</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-emerald-400">1. Options</h2>
            <div className="space-y-2 mb-6">
                <label htmlFor="direction" className="text-sm font-semibold text-gray-300">Action</label>
                <select id="direction" value={cleaningDirection} onChange={(e) => setCleaningDirection(e.target.value as 'clean' | 'prepare')} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-emerald-500 focus:border-emerald-500 text-sm">
                <option value="clean">Clean (from EXECUTE IMMEDIATE)</option>
                <option value="prepare">Prepare (for EXECUTE IMMEDIATE)</option>
                </select>
            </div>

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-emerald-400">2. Input Query</h2>
                <button onClick={handleCleanInput} className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded transition-colors" title="Clear input">
                    <Eraser size={14}/> Clean
                </button>
            </div>

            <div className="border border-gray-600 rounded-lg overflow-hidden">
              <CodeMirror value={inputQuery} height="500px" theme={githubDark} extensions={[sql()]} onChange={(v) => setInputQuery(v)} onFocus={handleFocus} style={{ fontSize: '14px' }}/>
            </div>

            <button 
                onClick={processQuery}
                disabled={isLoading || isPristine || !inputQuery}
                className="w-full mt-6 flex items-center justify-center gap-3 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 p-3 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                <Wand2 size={20} />
                {isLoading ? 'Processing...' : (cleaningDirection === 'clean' ? 'Clean Query' : 'Prepare Query')}
            </button>
          </div>
          
          {/* Output Panel */}
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-semibold text-emerald-400">Processed Query</h2>
                {isLoading && (
                    <div className='flex items-center gap-4'>
                        <Loader className="animate-spin text-emerald-400" size={20} />
                        <button onClick={handleStopStreaming} className="flex items-center gap-2 px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors" title="Stop generation">
                           <Square size={12} fill="currentColor"/> Stop
                        </button>
                    </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCleanOutput} className="flex items-center gap-2 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded transition-colors disabled:opacity-50" title="Clear output" disabled={!outputQuery || !!error}>
                    <Eraser size={14}/> Clean
                </button>
                <button onClick={handleCopy} className="flex items-center gap-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50" disabled={!outputQuery || !!error || isLoading}>
                  {copySuccess ? <><Check size={14}/> Copied!</> : <><Copy size={14}/> Copy</>}
                </button>
              </div>
            </div>

            {/* AQUI ESTÃO AS MUDANÇAS */}
            <div className='relative border border-gray-600 rounded-lg overflow-hidden'>
              {error && (<div className='absolute inset-0 flex flex-col items-center justify-center text-center bg-gray-900/80 z-10 p-4'><AlertTriangle className="text-red-400 mb-4" size={48} /><p className='text-red-400 font-semibold'>{error}</p></div>)}
              <CodeMirror 
                value={outputQuery} 
                height="700px" // Altura fixada para 500px
                theme={githubDark} 
                extensions={[sql()]} 
                readOnly={true} 
                style={{ fontSize: '14px' }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}