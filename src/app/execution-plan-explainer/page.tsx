// src/app/execution-plan-explainer/page.tsx

'use client';
import { useState, useRef, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { xml } from '@codemirror/lang-xml';
import { githubDark } from '@uiw/codemirror-theme-github';
import { placeholder } from '@codemirror/view';
import { Upload, Loader, AlertTriangle, Wand2, FileText, Eraser, Square } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ExecutionPlanExplainerPage() {
  const [planXml, setPlanXml] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // ===== ACEITA MÚLTIPLAS EXTENSÕES, MAS O CONTEÚDO SERÁ VALIDADO NO BACKEND =====
      const allowedExtensions = ['.xml', '.html', '.csv', '.txt'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!allowedExtensions.includes(fileExtension)) {
        setError('Invalid file type. Please upload a supported file (XML, HTML, CSV, TXT).');
        setPlanXml('');
        setFileName('');
        return;
      }
      
      setError('');
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setPlanXml(text);
      };
      reader.readAsText(file);
    }
  };

  const handleClean = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    setPlanXml('');
    setExplanation('');
    setError('');
    setFileName('');
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
  };

  const handleGenerateExplanation = useCallback(async () => {
    if (!planXml) {
      setError('Please upload or paste an execution plan first.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError('');
    setExplanation('');

    try {
      const response = await fetch('/api/execution-plan-explainer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionPlanXml: planXml }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Pega a mensagem de erro customizada do backend, se houver
        const errorText = await response.text();
        throw new Error(errorText || `Server error: ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('Response body is empty.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setExplanation((prev) => prev + chunk);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Stream aborted by user.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while generating the explanation.');
      }
    } finally {
       if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [planXml]);

  return (
    <div className="min-h-screen font-sans bg-gradient-to-br from-gray-900 to-slate-800 text-white flex flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-7xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4">
            <FileText size={40} className="text-cyan-400" />
            <h1 className="text-4xl font-bold">Execution Plan Explainer</h1>
          </div>
          <p className="text-lg text-gray-400 mt-2">Let AI explain your Oracle execution plans in simple terms.</p>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mt-4 inline-block">&larr; Back to AI Formatter</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PAINEL DE ENTRADA */}
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-cyan-400">1. Provide Your Execution Plan</h2>
            <p className="text-sm text-gray-400 mb-4">
              Upload your execution plan file (XML, TXT, etc.) or paste the content directly into the editor below.
            </p>

            <div className="flex items-center gap-2 mb-4">
                <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 p-3 rounded-lg transition-colors cursor-pointer">
                    <Upload size={18} />
                    {fileName ? `File: ${fileName}` : "Select File..."}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".xml,.html,.csv,.txt,text/xml,text/plain" />
                {(fileName || planXml) && (
                    <button onClick={handleClean} className="p-3 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors" title="Clear content">
                        <Eraser size={18} />
                    </button>
                )}
            </div>

            <div className="border border-gray-600 rounded-lg overflow-hidden flex-grow mt-2">
              <CodeMirror 
                value={planXml} 
                height="400px" 
                theme={githubDark} 
                extensions={[
                  xml(), 
                  placeholder('Paste your Oracle Execution Plan XML here...')
                ]} 
                onChange={(value) => setPlanXml(value)}
                readOnly={false}
                style={{ fontSize: '14px' }}
              />
            </div>
            
            <button onClick={handleGenerateExplanation} disabled={isLoading || !planXml} className="w-full mt-6 flex items-center justify-center gap-3 text-lg font-bold bg-cyan-600 hover:bg-cyan-700 p-3 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
              <Wand2 size={20}/>
              {isLoading ? 'Analyzing...' : 'Generate Explanation'}
            </button>
          </div>

          {/* PAINEL DE SAÍDA */}
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-cyan-400">2. AI-Powered Explanation</h2>
                {isLoading && (
                    <div className='flex items-center gap-2'>
                        <Loader className="animate-spin text-cyan-400" size={18} />
                        <button onClick={handleStopStreaming} className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors" title="Stop generation">
                           <Square size={10} fill="currentColor"/> Stop
                        </button>
                    </div>
                )}
            </div>
            
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 flex-grow h-[500px] overflow-y-auto prose prose-invert prose-sm max-w-none prose-headings:text-emerald-400 prose-strong:text-white">
                {error && (<div className='flex flex-col items-center justify-center text-center h-full'><AlertTriangle className="text-red-400 mb-4" size={48} /><p className='text-red-400 font-semibold'>{error}</p></div>)}
                {!error && !explanation && !isLoading && <p className="text-gray-400">The explanation will appear here once you generate it.</p>}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {explanation}
                </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}