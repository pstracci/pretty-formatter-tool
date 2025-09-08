// src/app/easy-image-reader/page.tsx

'use client';
import { Download, HardDrive, Cpu, GitMerge } from 'lucide-react';
import Link from 'next/link';

export default function EasyImageReaderPage() {
  // --- VALORES ATUALIZADOS ---
  const LATEST_VERSION = "2.3.0";
  const RELEASE_DATE = "September 8, 2025";
  // Link direto para o instalador da nova release
  const DOWNLOAD_LINK = "https://github.com/pstracci/EasyImageReader-/releases/download/v2.3.0/EasyImageReader-Setup-v2.1.exe"; 

  return (
    <div className="font-sans bg-gradient-to-br from-gray-900 to-slate-800 text-white min-h-screen">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        
        {/* Header */}
        <header className="text-center border-b border-gray-700 pb-8 mb-12">
          <h1 className="text-5xl font-bold text-emerald-400">Easy Image Reader</h1>
          <p className="text-xl text-gray-400 mt-4">Instantly capture and extract text from any image.</p>
        </header>

        <main className="space-y-16">
          
          {/* Main Download Section */}
          <section className="flex flex-col md:flex-row items-center gap-8 bg-gray-800/50 p-8 rounded-lg border border-gray-700">
            <div className="flex-1 space-y-4">
              <h2 className="text-3xl font-bold">Simple, Fast, and Free</h2>
              <p className="text-gray-300">
                A lightweight tool that sits in your system tray, ready to be used with a simple keyboard shortcut. Select any area of your screen and have the text copied to your clipboard in seconds.
              </p>
              <div className="pt-4">
                <a href={DOWNLOAD_LINK} className="inline-flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-transform hover:scale-105">
                  <Download size={22} />
                  <span>Download v{LATEST_VERSION} for Windows (x64)</span>
                </a>
                <p className="text-xs text-gray-500 mt-2">Released on: {RELEASE_DATE}</p>
              </div>
            </div>
            <div className="flex-1 text-center">
              {/* GIF de demonstração do aplicativo */}
              <img 
                src="/gifs/demo-app.gif" 
                alt="Demonstração do Easy Image Reader em ação"
                className="w-full h-64 rounded-md object-contain"
              />
            </div>
          </section>

          {/* Key Features Section */}
          <section>
            <h2 className="text-3xl font-bold text-center mb-8">Key Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h3 className="text-xl font-semibold text-emerald-400 mb-2">Powerful OCR</h3>
                <p className="text-gray-400">Uses EasyOCR technology for accurate text recognition across multiple languages.</p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h3 className="text-xl font-semibold text-emerald-400 mb-2">Global Hotkey</h3>
                <p className="text-gray-400">Set a custom keyboard shortcut to start capturing from anywhere.</p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h3 className="text-xl font-semibold text-emerald-400 mb-2">Highly Configurable</h3>
                <p className="text-gray-400">Choose languages, enable GPU acceleration, start with Windows, and more.</p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h3 className="text-xl font-semibold text-emerald-400 mb-2">Lightweight & Discreet</h3>
                <p className="text-gray-400">Runs silently in your system tray, consuming few resources.</p>
              </div>
            </div>
          </section>

          {/* Version History Section (Changelog ATUALIZADO) */}
          <section>
            <h2 className="text-3xl font-bold text-center mb-8">Version History (Changelog)</h2>
            <div className="space-y-6 bg-gray-800/50 p-6 rounded-lg border border-gray-700">
              {/* NOVA VERSÃO ADICIONADA AQUI */}
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2"><GitMerge size={18} />Version 2.3.0 <span className="text-sm text-gray-500 font-normal">- {RELEASE_DATE}</span></h3>
                <ul className="list-disc list-inside mt-2 text-gray-400 space-y-1">
                  <li>🎉 **Windows Installer:** The application is now distributed with a full-featured installer for easy setup.</li>
                  <li>✨ **Improved User Interface:** The Options window has been completely redesigned for better clarity and now has a fixed size to prevent layout issues.</li>
                  <li>✨ **Enhanced Tray Icon Behavior:** Left-clicking the tray icon now directly starts the text capture, while right-clicking opens the full menu.</li>
                  <li>🐞 **OCR Engine Fix:** Resolved a critical bug that prevented the OCR model from loading when multiple incompatible languages were selected.</li>
                  <li>🐞 **UI Fixes:** The Options window no longer flashes on the screen corner before centering itself.</li>
                </ul>
              </div>
              
              <div className="pt-4 border-t border-gray-700">
                <h3 className="font-semibold text-lg flex items-center gap-2"><GitMerge size={18} />Version 2.1 <span className="text-sm text-gray-500 font-normal">- Old release date</span></h3>
                <ul className="list-disc list-inside mt-2 text-gray-400 space-y-1">
                  <li>✨ Added option for audio feedback on copy.</li>
                  <li>✨ Added more default languages (Spanish, French, German).</li>
                  <li>✨ Updated the &quot;About&quot; window with developer info.</li>
                  <li>🐞 Fixed a bug that occurred on some systems when starting the compiled version.</li>
                </ul>
              </div>

               <div className="pt-4 border-t border-gray-700">
                <h3 className="font-semibold text-lg flex items-center gap-2"><GitMerge size={18} />Version 2.0 <span className="text-sm text-gray-500 font-normal">- Old release date</span></h3>
                <ul className="list-disc list-inside mt-2 text-gray-400 space-y-1">
                    <li>🚀 Migrated OCR engine from Tesseract to EasyOCR, removing external dependencies.</li>
                    <li>✨ Added Options window (Start with Windows, GPU, Languages).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* System Requirements Section */}
          <section>
            <h2 className="text-3xl font-bold text-center mb-8">System Requirements</h2>
            <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                <ul className="space-y-3">
                    <li className="flex items-start gap-3"><HardDrive size={20} className="text-emerald-400 mt-1" /> <div><strong>Operating System:</strong> Windows 10 or 11 (64-bit)</div></li>
                    <li className="flex items-start gap-3"><Cpu size={20} className="text-emerald-400 mt-1" /> <div><strong>RAM:</strong> 4 GB (8 GB recommended for multiple languages)</div></li>
                </ul>
            </div>
          </section>

        </main>
        
        {/* Footer */}
        <footer className="text-center pt-12 mt-12 border-t border-gray-700">
            <p className="text-gray-400">
                <Link href="/" className="text-emerald-400 hover:text-emerald-300">Back to AI Formatter</Link>
            </p>
            <p className="text-gray-500 text-sm mt-4">
                Developed by Paulo Stracci | Contact: <a href="mailto:paulo.stracci@gmail.com" className="hover:text-emerald-400">paulo.stracci@gmail.com</a>
            </p>
        </footer>
      </div>
    </div>
  );
}