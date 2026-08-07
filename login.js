import { supabaseClient } from './supabase_client.js';
import { mostrarToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Opcional: Mudar o ícone do olho se desejar
    });

    // --- LOGIN POR BIOMETRIA (Passkeys) ---
    const biometryToggle = document.getElementById('biometryToggle');
    if (biometryToggle) {
        biometryToggle.addEventListener('change', async () => {
            if (biometryToggle.checked) {
                alert("Para ativar a biometria, você precisa estar logado. O sistema usará Passkeys do Google/Apple.");
            }
        });
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = e.target.querySelector('button');

        btn.innerText = "Autenticando...";
        btn.disabled = true;

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            mostrarToast("Erro no login: " + error.message, "error");
            btn.innerText = "Acessar Painel";
            btn.disabled = false;
            return;
        }

        direcionarUsuario(data.user.id);
    });

    // --- CADASTRO DE NOVO USUÁRIO ---
    document.getElementById('btnCadastrar').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!email || !password) return alert("Preencha e-mail e senha para cadastrar.");

        const { data, error } = await supabaseClient.auth.signUp({ email, password });

        if (error) return mostrarToast("Erro ao cadastrar: " + error.message, "error");
        
        mostrarToast("Cadastro realizado! Verifique seu e-mail para confirmar.");
    });

    // --- RECUPERAÇÃO DE SENHA ---
    document.getElementById('btnRecuperar').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        if (!email) return alert("Digite seu e-mail primeiro.");

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html',
        });

        if (error) mostrarToast(error.message, "error");
        else mostrarToast("E-mail de recuperação enviado!");
    });
});

async function direcionarUsuario(userId) {
    const { data: profile, error } = await supabaseClient
        .from('alunos')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) {
        console.warn("Perfil não encontrado na tabela 'alunos'. Redirecionando para área básica.", error);
    }

    // Se não encontrar perfil ou não for admin, assume que é aluno
    if (profile && profile.role === 'admin') {
        window.location.href = 'index.html';
    } else {
        console.log("Usuário logado como Aluno ou perfil inexistente.");
        window.location.href = 'meu-plano.html';
    }
} 