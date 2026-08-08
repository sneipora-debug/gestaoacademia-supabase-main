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

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

            if (error) {
                mostrarToast("Erro no login: " + error.message, "error");
                btn.innerText = "Entrar";
                btn.disabled = false;
                return;
            }

            direcionarUsuario(data.user);
        } catch (err) {
            console.error("Erro de conexão:", err);
        
        // Detecta se o erro é um bloqueio de rede/CORS (NetworkError ou Failed to fetch)
        if (err.name === 'TypeError' || err.message.includes('fetch')) {
            mostrarToast("Acesso bloqueado pelo navegador! Desative o AdBlock ou a Proteção de Rastreamento.", "error");
        } else {
            mostrarToast("Erro de conexão. Verifique sua internet.", "error");
        }
        
            btn.innerText = "Entrar";
            btn.disabled = false;
        }
    });

    // --- CADASTRO DE NOVO USUÁRIO ---
    document.getElementById('btnCadastrar').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!email || !password) return alert("Preencha e-mail e senha para cadastrar.");

        try {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });

            if (error) return mostrarToast("Erro ao cadastrar: " + error.message, "error");
            
            if (data?.user?.identities?.length === 0) {
                mostrarToast("Este e-mail já possui conta. Tente fazer login ou recuperar a senha.", "warning");
            } else {
                mostrarToast("Cadastro realizado! Verifique seu e-mail para confirmar.");
            }
        } catch (err) {
            console.error("Erro de conexão no cadastro:", err);
            mostrarToast("Erro de rede ao cadastrar. Desative bloqueadores de rastreamento.", "error");
        }
    });

    // --- RECUPERAÇÃO DE SENHA ---
    document.getElementById('btnRecuperar').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        if (!email) return alert("Digite seu e-mail primeiro.");

        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html',
            });

            if (error) {
                mostrarToast(error.message, "error");
            } else {
                mostrarToast("E-mail de recuperação enviado!");
                
                // 1. Tenta buscar na tabela Alunos
                let { data: user } = await supabaseClient.from("alunos")
                    .select("id")
                    .eq("email", email)
                    .maybeSingle();

                // 2. Se não achou, tenta na Equipe (para o Admin ver a notificação)
                if (!user) {
                    const { data: staff } = await supabaseClient.from("equipe")
                        .select("id")
                        .eq("email", email)
                        .maybeSingle();
                    user = staff;
                }

                if (user) {
                    // Registra a intenção de troca para o admin monitorar
                    await supabaseClient.from("solicitacoes_senha").insert([{ aluno_id: user.id, status: 'pendente' }]);
                }
            }
        } catch (err) {
            mostrarToast("Erro de rede ao solicitar recuperação.", "error");
        }
    });
});

async function direcionarUsuario(user) {
    if (!user) return;
    const userId = user.id;
    const userEmail = user.email;

    console.log("Iniciando direcionamento para:", userEmail);

    // 1. Tenta buscar na tabela da Equipe
    let { data: staffProfile, error: staffError } = await supabaseClient
        .from('equipe')
        .select('role, user_id, id, status')
        .eq('user_id', userId)
        .maybeSingle(); 

    if (staffError) console.error("Erro ao buscar equipe:", staffError);

    // Bloqueio de acesso por status (Empresa desativada pelo Master)
    if (staffProfile && staffProfile.status === false) {
        await supabaseClient.auth.signOut();
        return mostrarToast("Sua conta ou empresa está desativada. Contate o suporte.", "error");
    }

    // VÍNCULO AUTOMÁTICO PARA EQUIPE (Auto-Ativação)
    if (!staffProfile && userEmail) {
        const { data: staffByEmail } = await supabaseClient
            .from('equipe')
            .select('id, role')
            .eq('email', userEmail)
            .maybeSingle();
        
        if (staffByEmail) {
            console.log("Vinculando conta de equipe encontrada por e-mail...");
            await supabaseClient.from('equipe').update({ user_id: userId }).eq('id', staffByEmail.id);
            staffProfile = staffByEmail;
        }
    }

    if (staffProfile) {
        console.log("Usuário identificado como Equipe:", staffProfile.role);
        window.location.href = 'index.html';
        return;
    }

    // 2. Se não for equipe, busca nos Alunos
    let { data: studentProfile, error: studentError } = await supabaseClient
        .from('alunos')
        .select('id, user_id')
        .eq('user_id', userId)
        .maybeSingle();

    if (studentError) console.error("Erro ao buscar aluno:", studentError);

    // VÍNCULO AUTOMÁTICO PARA ALUNOS
    if (!studentProfile && userEmail) {
        const { data: studentByEmail } = await supabaseClient
            .from('alunos')
            .select('id')
            .eq('email', userEmail)
            .maybeSingle();
        
        if (studentByEmail) {
            console.log("Vinculando conta de aluno encontrada por e-mail...");
            await supabaseClient.from('alunos').update({ user_id: userId }).eq('id', studentByEmail.id);
            studentProfile = studentByEmail;
        }
    }

    if (studentProfile) {
        window.location.href = 'meu-plano.html';
    } else {
        console.warn("Perfil não encontrado. Verifique se o user_id está vinculado nas tabelas equipe ou alunos.");
        mostrarToast("Seu cadastro ainda não foi vinculado ao sistema. Fale com o suporte.", "error");
    }
} 