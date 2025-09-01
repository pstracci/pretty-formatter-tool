// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Fira_Code } from "next/font/google"; // Importe Fira Code
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
// Configure a Fira Code
const firaCode = Fira_Code({ subsets: ["latin"], weight: ["400", "500"], variable: '--font-fira-code' });

// Objeto de metadados otimizado para SEO
export const metadata: Metadata = {
  title: 'Free AI Code Formatter & Beautifier for JS, SQL, Python & More',
  description: 'Instantly format and beautify your code with our free AI-powered tool. Supports JavaScript, Python, SQL, JSON, and more. Just paste your code and get clean, readable results.',
  keywords: 'code formatter, free code formatter, AI code formatter, code beautifier, javascript formatter, python formatter, sql formatter, json formatter, auto formatter',
  authors: [{ name: 'Paulo Stracci' }],
  creator: 'Paulo Stracci',
  publisher: 'Paulo Stracci',
  openGraph: {
    title: 'Free AI Code Formatter & Beautifier',
    description: 'Instantly format and beautify your code with our free AI-powered tool. Supports multiple languages.',
    url: 'https://ai-formatter.com',
    siteName: 'AI Formatter',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Free AI Code Formatter & Beautifier',
    description: 'Instantly format and beautify your code with our free AI-powered tool.',
    creator: '@paulostracci', 
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      {/* Combine as variáveis das fontes no className */}
      <body className={`${inter.variable} ${firaCode.variable} bg-gray-900 text-white`}>
        {children}
      </body>
    </html>
  );
}