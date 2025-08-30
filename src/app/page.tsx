// src/app/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { githubDark } from '@uiw/codemirror-theme-github';
import { Settings, Code, Loader, AlertTriangle, Copy, Check, Upload, Download, FileCode } from 'lucide-react';

const LINE_LIMIT = 1000;
const PLACEHOLDER_TEXT = '// Cole seu código, ou selecione um arquivo para formatar...';

export default function HomePage() {
  const [inputCode, setInputCode] = useState<string>(PLACEHOLDER_TEXT);
  const [formattedCode, setFormattedCode] = useState<string>('');
  const [isFormatting, setIsFormatting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>('auto');
  const [outputFileName, setOutputFileName] = useState<string>('formatted-code.txt');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [lineCountError, setLineCountError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // NOVO ESTADO: Controla se o placeholder está ativo
  const [isPristine, setIsPristine] = useState<boolean>(true);

  const formatCode = useCallback(async (codeToFormat: string, language: string) => {
    // LÓGICA ATUALIZADA: Agora a validação bloqueia a execução
    if (isPristine || !codeToFormat || codeToFormat.trim() === '') {
      return;
    }
    const lines = codeToFormat.split('\n').length;
    if (lines > LINE_LIMIT) {
      setLineCountError(`Limite de ${LINE_LIMIT} linhas excedido para usuários free. A formatação está pausada.`);
      return; // Impede a chamada da API
    } else {
      setLineCountError('');
    }

    setIsFormatting(true);
    setError('');

    try {
      const response = await fetch('/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToFormat, language: language }),
      });

      if (!response.ok) throw new Error('Erro na resposta do servidor.');

      const data = await response.json();
      
      if (data.formattedCode === 'UNFORMATTABLE_TEXT') {
        setError('Não foi possível formatar, tente outro texto.');
        setFormattedCode(inputCode);
      } else {
        setFormattedCode(data.formattedCode);
      }
    } catch (err) {
      setError('Ocorreu um erro. Tente novamente.');
      console.error(err);
    } finally {
      setIsFormatting(false);
    }
  }, [isPristine, inputCode]);

  useEffect(() => {
    const handler = setTimeout(() => {
      formatCode(inputCode, selectedLanguage);
    }, 1500);
    return () => clearTimeout(handler);
  }, [inputCode, selectedLanguage, formatCode]);

  const onCodeChange = useCallback((value: string) => {
    // LÓGICA ATUALIZADA: A validação agora acontece aqui, em tempo real
    const lines = value.split('\n').length;
    if (lines > LINE_LIMIT) {
      setLineCountError(`Limite de ${LINE_LIMIT} linhas excedido para usuários free. A formatação está pausada.`);
    } else {
      setLineCountError('');
    }
    setInputCode(value);
  }, []);
  
  const handleFocus = () => {
    if (isPristine) {
      setInputCode('');
      setIsPristine(false);
    }
  };
  
  const handleCopy = () => {
    if (!formattedCode) return;
    navigator.clipboard.writeText(formattedCode);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    if (!formattedCode) return;
    const blob = new Blob([formattedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = outputFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsPristine(false); // Desativa o placeholder
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setInputCode(text);
      };
      reader.readAsText(file);
      setOutputFileName(`formatted-${file.name}`);
    }
  };

  return (
    <div className="flex h-screen font-sans bg-gradient-to-br from-gray-900 to-slate-800">
      <aside className="w-72 bg-gray-900/50 p-6 flex flex-col justify-between border-r border-gray-700">
        {/* ... (o código da barra lateral continua o mesmo) ... */}
         <div>
          <h1 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            <FileCode /> Pretty Formatter
          </h1>
          <p className="text-sm text-gray-400 mt-1">AI-Powered Code Formatting</p>
          
          <div className="mt-10 space-y-6">
            <div className="space-y-2">
              <label htmlFor="language" className="text-sm font-semibold text-gray-300">Optimize for...</label>
              <select 
                id="language"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              >
                <option value="auto">Auto-Detect</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="sql">SQL</option>
                <option value="dockerfile">Dockerfile</option>
                <option value="log-files">Log Files</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="filename" className="text-sm font-semibold text-gray-300">Download file as...</label>
              <input 
                type="text" 
                id="filename"
                value={outputFileName}
                onChange={(e) => setOutputFileName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              />
            </div>
          </div>
        </div>
        <footer className="text-xs text-center text-gray-500">
          Powered by Next.js & OpenAI
        </footer>
      </aside>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-hidden">
        <div className="flex flex-col rounded-lg overflow-hidden border border-gray-700">
          <div className="bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 flex justify-between items-center">
            <span>Entrada</span>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 rounded transition-colors">
              <Upload size={14}/> Selecionar Arquivo
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          </div>
          <CodeMirror
            value={inputCode}
            height="calc(100vh - 95px)"
            theme={githubDark}
            extensions={[javascript({ jsx: true, typescript: true })]}
            onChange={onCodeChange}
            onFocus={handleFocus} // NOVO: Limpa o placeholder ao focar
            style={{ fontSize: '14px', fontFamily: 'var(--font-fira-code)' }}
          />
          {lineCountError && <div className="bg-red-900 text-red-200 text-center text-xs py-1 px-4">{lineCountError}</div>}
        </div>

        {/* ... (o código da caixa de saída continua o mesmo) ... */}
        <div className="flex flex-col rounded-lg overflow-hidden border border-gray-700 bg-gray-800/50">
          <div className="bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span>Saída Formatada</span>
              {isFormatting && <Loader className="animate-spin text-emerald-400" size={18} />}
            </div>
            <div className="flex items-center gap-2">
                <button onClick={handleCopy} className="flex items-center gap-2 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded transition-colors disabled:opacity-50" disabled={!formattedCode}>
                  {copySuccess ? <><Check size={14}/> Copiado!</> : <><Copy size={14}/> Copiar</>}
                </button>
                <button onClick={handleDownload} className="flex items-center gap-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50" disabled={!formattedCode}>
                  <Download size={14}/> Baixar
                </button>
            </div>
          </div>
          <div className='relative h-full'>
            {error && (
               <div className='absolute inset-0 flex flex-col items-center justify-center text-center bg-gray-800 z-10 p-4'>
                 <AlertTriangle className="text-red-400 mb-4" size={48} />
                 <p className='text-red-400 font-semibold'>{error}</p>
               </div>
            )}
            <CodeMirror
              value={formattedCode}
              height="calc(100vh - 60px)"
              theme={githubDark}
              extensions={[javascript({ jsx: true, typescript: true })]}
              readOnly={true}
              style={{ fontSize: '14px', fontFamily: 'var(--font-fira-code)' }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}