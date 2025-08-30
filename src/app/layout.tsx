// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Fira_Code } from "next/font/google"; // Importe Fira Code
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
// Configure a Fira Code
const firaCode = Fira_Code({ subsets: ["latin"], weight: ["400", "500"], variable: '--font-fira-code' });

export const metadata: Metadata = {
  title: "Pretty Formatter Tool",
  description: "Formate qualquer código usando o poder da IA.",
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