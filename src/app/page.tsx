'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { githubDark } from '@uiw/codemirror-theme-github';
import { FileCode, Upload, Download, Copy, Check, Loader, AlertTriangle, Coffee, Info, X } from 'lucide-react';
import Link from 'next/link';

const LINE_LIMIT = 1000;
const PLACEHOLDER_TEXT = '// Paste your code, or select a file to format...';

const AboutModal = ({ onClose }: { onClose: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full text-gray-300 border border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-gray-700 sticky top-0 bg-gray-800">
          <h2 className="text-xl font-bold text-emerald-400">About AI Formatter & Updates</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <section>
            <h3 className="text-lg font-semibold text-gray-100 mb-2">How to Use</h3>
            <ul className="list-disc list-inside space-y-2 text-sm">
              <li>Paste your code directly into the "Input Code" panel.</li>
              <li>Alternatively, click "Select File" to upload a code file from your computer.</li>
              <li>The code will be formatted automatically in the "Formatted Output" panel after a short delay.</li>
              <li>Use the "Optimize for..." dropdown menu to give the AI a hint about the code's language for better results.</li>
              <li>Copy or download your formatted code using the buttons at the top right of the output panel.</li>
            </ul>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-100 mb-2">About the Author</h3>
            <p className="text-sm">
              This tool was created by Paulo Stracci. You can reach me via the links below.
            </p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              <a href="mailto:paulo.stracci@gmail.com" className="text-emerald-400 hover:text-emerald-300">Email</a>
              <a href="mailto:paulo_stracci@hotmail.com" className="text-emerald-400 hover:text-emerald-300">LinkedIn (paulo_stracci@hotmail.com)</a>
            </div>
             <p className="text-sm mt-4">
              Check out my other project, a language learning platform: <a href="https://www.verbi.com.br" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 font-semibold">Verbi</a>.
            </p>
          </section>
          <section>
            <h3 className="text-lg font-semibold text-gray-100 mb-2">Changelog</h3>
            <div className="space-y-3 text-sm">
                <div>
                    <p className="font-semibold text-gray-200">August 2025</p>
                    <ul className="list-disc list-inside mt-1">
                        <li>Initial launch of AI Formatter!</li>
                        <li>Features live streaming formatting and support for multiple languages.</li>
                    </ul>
                </div>
            </div>
          </section>
        </div>
      </div>
    </div>
);


export default function HomePage() {
  const [inputCode, setInputCode] = useState<string>(PLACEHOLDER_TEXT);
  const [formattedCode, setFormattedCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>('auto');
  const [outputFileName, setOutputFileName] = useState<string>('formatted-code.txt');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [lineCountError, setLineCountError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPristine, setIsPristine] = useState<boolean>(true);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);


  const formatCode = useCallback(async (codeToFormat: string, language: string) => {
    const lines = codeToFormat.split('\n').length;
    if (isPristine || !codeToFormat || codeToFormat.trim() === '' || lines > LINE_LIMIT) {
      if (lines > LINE_LIMIT) setLineCountError(`Line limit of ${LINE_LIMIT} exceeded. Formatting paused.`);
      return;
    } else {
      setLineCountError('');
    }

    setIsLoading(true);
    setError('');
    setFormattedCode('');

    try {
      const response = await fetch('/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToFormat, language: language }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
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
        setFormattedCode((prev) => prev + chunk);
      }
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An error occurred while formatting.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isPristine]);

  useEffect(() => {
    const handler = setTimeout(() => {
      formatCode(inputCode, selectedLanguage);
    }, 1500);
    return () => clearTimeout(handler);
  }, [inputCode, selectedLanguage, formatCode]);
  
  const onCodeChange = useCallback((value: string) => {
    const lines = value.split('\n').length;
    if (lines > LINE_LIMIT) {
      setLineCountError(`Line limit of ${LINE_LIMIT} exceeded for free users. Formatting paused.`);
    } else {
      setLineCountError('');
    }
    setInputCode(value);
  }, []);
  const handleFocus = () => { if (isPristine) { setInputCode(''); setIsPristine(false); } };
  const handleCopy = () => { if (!formattedCode) return; navigator.clipboard.writeText(formattedCode); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); };
  const handleDownload = () => { if (!formattedCode) return; const blob = new Blob([formattedCode], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = outputFileName; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); };
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) { setIsPristine(false); const reader = new FileReader(); reader.onload = (e) => { const text = e.target?.result as string; setInputCode(text); }; reader.readAsText(file); setOutputFileName(`formatted-${file.name}`); } };

  return (
    <div className="h-screen font-sans bg-gradient-to-br from-gray-900 to-slate-800 text-white flex flex-col">
      {isAboutModalOpen && <AboutModal onClose={() => setIsAboutModalOpen(false)} />}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 bg-gray-900/50 p-6 flex flex-col justify-between border-r border-gray-700">
           <div>
              <h1 className="text-2xl font-bold text-emerald-400 flex items-center gap-2"><FileCode /> AI Formatter</h1>
              <p className="text-sm text-gray-400 mt-1">AI-Powered Code Formatting</p>
              
              <div className="space-y-2 pt-6 my-4 border-t border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300">Try Other Tools</h3>
                  <Link href="/oracle-optimizer" className="block text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
                    - Oracle Query Optimizer
                  </Link>
              </div>

              <div className="mt-4 space-y-6">
                <div className="space-y-2">
                  <label htmlFor="language" className="text-sm font-semibold text-gray-300">Optimize for...</label>
                  <select id="language" value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-emerald-500 focus:border-emerald-500 text-sm">
                    <option value="auto">Auto-Detect</option>
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option><option value="java">Java</option>
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
                  <input type="text" id="filename" value={outputFileName} onChange={(e) => setOutputFileName(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-emerald-500 focus:border-emerald-500 text-sm"/>
                </div>
              </div>
            </div>
            <div className="space-y-4 pt-6 border-t border-gray-700">
                <button onClick={() => setIsAboutModalOpen(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-white hover:bg-gray-700/50 font-bold rounded-md transition-colors text-sm">
                  <Info size={18} /> About & Updates
                </button>
                <div className="space-y-2 pt-2 border-t border-gray-600">
                  <h3 className="text-sm font-semibold text-gray-300 text-center">Support This Project</h3>
                  <a href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=paulo.stracci@gmail.com&item_name=Support+for+AI+Formatter+Tool&currency_code=USD" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-md transition-colors text-sm">
                    <Coffee size={18} /> Buy me a Coffee
                  </a>
                </div>
            </div>
		</aside>
        <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-hidden">
          <div className="flex flex-col rounded-lg overflow-hidden border border-gray-700">
            <div className="bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 flex justify-between items-center">
              <span>Input Code</span><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 rounded transition-colors"><Upload size={14}/> Select File</button><input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            </div>
            <CodeMirror value={inputCode} height="calc(100vh - 120px)" theme={githubDark} extensions={[javascript({ jsx: true, typescript: true })]} onChange={onCodeChange} onFocus={handleFocus} style={{ fontSize: '14px', fontFamily: 'var(--font-fira-code)' }}/>{lineCountError && <div className="bg-red-900 text-red-200 text-center text-xs py-1 px-4">{lineCountError}</div>}
          </div>
          <div className="flex flex-col rounded-lg overflow-hidden border border-gray-700 bg-gray-800/50">
            <div className="bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 flex justify-between items-center">
              <div className="flex items-center gap-2"><span>Formatted Output</span>{isLoading && <Loader className="animate-spin text-emerald-400" size={18} />}</div>
              <div className="flex items-center gap-2"><button onClick={handleCopy} className="flex items-center gap-2 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded transition-colors disabled:opacity-50" disabled={!formattedCode || !!error}>{copySuccess ? <><Check size={14}/> Copied!</> : <><Copy size={14}/> Copy</>}</button><button onClick={handleDownload} className="flex items-center gap-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50" disabled={!formattedCode || !!error}><Download size={14}/> Download</button></div>
            </div>
            <div className='relative h-full'>
              {error && (<div className='absolute inset-0 flex flex-col items-center justify-center text-center bg-gray-800 z-10 p-4'><AlertTriangle className="text-red-400 mb-4" size={48} /><p className='text-red-400 font-semibold'>{error}</p></div>)}
              <CodeMirror value={formattedCode} height="calc(100vh - 85px)" theme={githubDark} extensions={[javascript({ jsx: true, typescript: true })]} readOnly={true} style={{ fontSize: '14px', fontFamily: 'var(--font-fira-code)' }}/>
            </div>
          </div>
        </main>
		
		
      </div>
      <div className="bg-gray-900/70 text-gray-400 text-xs p-2 text-center border-t border-gray-700 flex-shrink-0">Disclaimer: This formatter is AI-powered and may produce errors. Always validate the output before 100% reliance.</div>
    </div>
  );
}