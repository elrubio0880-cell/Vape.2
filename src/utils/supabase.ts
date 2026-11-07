import { createClient } from '@supabase/supabase-js';

// Access environment variables safely in both Vite (browser) and Node.js (test runner)
const getEnvVar = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.[key]) {
      return (import.meta as any).env[key];
    }
  } catch {
    // Ignore in non-Vite environments
  }
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key] as string;
    }
  } catch {
    // Ignore
  }
  return '';
};

const DEFAULT_SUPABASE_URL = 'https://pjipjzsdosyxasnhwmbk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqaXBqenNkb3N5eGFzbmh3bWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MTU2NTAsImV4cCI6MjEwOTQ5MTY1MH0.uk_TRfeb0qpvUOp63h-dYBKnMBCsis6tfsqC7YIAGQY';

const rawEnvUrl = getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL');
const rawEnvKey =
  getEnvVar('VITE_SUPABASE_ANON_KEY') ||
  getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  getEnvVar('SUPABASE_PUBLISHABLE_KEY') ||
  getEnvVar('SUPABASE_ANON_KEY');

// Ignore deprecated legacy project 'alwxeeyozlxfuysxhzay' if still present in container env
const isDeprecatedEnvProject = rawEnvUrl.includes('alwxeeyozlxfuysxhzay');

const supabaseUrl =
  !isDeprecatedEnvProject && rawEnvUrl ? rawEnvUrl : DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  !isDeprecatedEnvProject && rawEnvKey ? rawEnvKey : DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('tu-proyecto') &&
    !supabaseAnonKey.includes('tu-clave') &&
    !supabaseUrl.includes('placeholder')
  );
};

// Cliente oficial de Supabase para navegador (usando la anon key pública)
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
