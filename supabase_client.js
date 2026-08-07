const SUPABASE_URL = "https://ltuepchgoxagpquwalbi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0dWVwY2hnb3hhZ3BxdXdhbGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDczMjYsImV4cCI6MjA5NjE4MzMyNn0.g7742A-X_TM-YOZDB40e2aweKfxAfr4xbF29_NlsC2Q";

// Inicializa o cliente global
export const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

if (!supabaseClient) {
  console.error("Erro: A biblioteca do Supabase não foi carregada no HTML.");
}