'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div>
        <h1>Login</h1>
        <button 
          onClick={() => signIn('google', { callbackUrl: '/' })}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        >
          Sign in with Google
        </button>
        {/* Outros provedores serão adicionados aqui depois */}
      </div>
    </div>
  );
}