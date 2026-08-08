import { supabaseClient } from './supabase_client.js';
import { mostrarToast, normalizarTexto, inicializarHeaderUsuario } from './utils.js';

let editUserId = null;
let gestaoSenhaData = { internalId: null, email: null, authId: null };
let loggedProfile = null;

document.addEventListener("DOMContentLoaded", async () => {
    // Inicializa o cabeçalho do usuário
    await inicializarHeaderUsuario();
    
    // Pega dados da sessão para saber quem está operando
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) {
        console.error("Sessão não encontrada ou bloqueada pelo navegador.");
        return;
    }
    window.currentUserSession = session;

    // POLÍTICA DE ACESSO: Apenas Master e Empresário (admin) acessam esta página
    const { data: profile } = await supabaseClient.from("equipe").select("id, role").eq("user_id", session.user.id).maybeSingle();
    loggedProfile = profile;

    if (!profile || (profile.role !== 'master' && profile.role !== 'admin')) {
        mostrarToast("Acesso negado: Você não tem permissão para gerenciar a equipe.", "error");
        // Redireciona para evitar que o professor permaneça na tela
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    // Restringe os cargos disponíveis no cadastro baseado no cargo de quem logou
    const roleSelect = document.getElementById("user_role");
    if (roleSelect && profile.role === 'admin') {
        roleSelect.innerHTML = `
            <option value="professor">Professor / Trainer</option>
            <option value="staff">Recepcionista / Colaborador</option>
        `;
    }

    await carregarUsuarios(); // Agora aguarda o carregamento para evitar race conditions
    carregarSolicitacoesSenha(); // Nova funcionalidade adaptada
    document.getElementById("formUsuario")?.addEventListener("submit", salvarUsuario);
    document.getElementById("btnCancelar")?.addEventListener("click", resetarForm);

    // Adiciona a função global para atualizar status
    window.atualizarStatusEquipe = async (id, novoStatus) => {
        const { error } = await supabaseClient
            .from("equipe")
            .update({ status: novoStatus })
            .eq("id", id);

        if (error) mostrarToast("Erro ao atualizar status: " + error.message, "error");
        else mostrarToast("Status atualizado!");
    };

    // Toggle do olho para visualização da senha
    document.getElementById('toggleSenhaAdmin')?.addEventListener('click', () => {
        const input = document.getElementById('nova_senha_admin');
        const icon = document.getElementById('toggleSenhaAdmin');
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        icon.innerText = isPass ? '🙈' : '👁️';
    });

    // Toggle do olho para o campo de senha no formulário principal
    document.getElementById('toggleSenhaForm')?.addEventListener('click', () => {
        const input = document.getElementById('user_password');
        const icon = document.getElementById('toggleSenhaForm');
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        icon.innerText = isPass ? '🙈' : '👁️';
    });

    document.getElementById('btnEnviarEmailRecuperacao')?.addEventListener('click', () => executarAcaoSenha('email'));
    document.getElementById('btnSalvarSenhaManual')?.addEventListener('click', () => executarAcaoSenha('manual'));
});

async function carregarUsuarios() {
    // Agora busca diretamente da tabela equipe
    const { data: usuarios, error } = await supabaseClient
        .from("equipe")
        .select("*")
        .order("nome");

    if (error) return mostrarToast("Erro ao carregar usuários.", "error");

    const tabela = document.getElementById("tabelaUsuarios");
    if (!tabela) return;
    tabela.innerHTML = "";

    // Usa o perfil logado que já buscamos no DOMContentLoaded
    if (!loggedProfile) {
        const { data: profile } = await supabaseClient.from("equipe").select("id, role").eq("user_id", window.currentUserSession?.user?.id).maybeSingle();
        loggedProfile = profile;
    }

    usuarios.forEach(item => {
        const row = tabela.insertRow();
        const roleMap = { 
            'master': '👑 Administrador Geral', 
            'admin': '🏢 Empresário', 
            'professor': '👨‍🏫 Professor', 
            'staff': '🤝 Colaborador' 
        };

        // Regra: Empresário não altera o próprio status, apenas o Master pode.
        const isOwnAccount = item.user_id === window.currentUserSession?.user?.id;
        const canChangeStatus = loggedProfile?.role === 'master' || (loggedProfile?.role === 'admin' && !isOwnAccount && item.role !== 'master' && item.role !== 'admin');
        
        row.innerHTML = `
            <td><strong>${item.nome}</strong></td>
            <td>${item.email}</td>
            <td><span class="status-badge ${item.role === 'master' || item.role === 'admin' ? 'pago' : 'atrasado'}">${roleMap[item.role] || item.role}</span></td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" ${item.status ? 'checked' : ''} 
                           ${!canChangeStatus ? 'disabled' : ''}
                           onchange="window.atualizarStatusEquipe('${item.id}', this.checked)"
                           title="${!canChangeStatus ? 'Apenas o Administrador Geral pode alterar este status' : ''}">
                    <small style="color:${item.status ? 'var(--success)' : 'var(--danger)'}">${item.status ? 'Ativo' : 'Inativo'}</small>
                </div>
            </td>
            <td>
                <button onclick="window.editarUsuario('${item.id}')" title="Editar" style="background:none; color:var(--primary); padding:0; margin-right:12px;">✏️</button>
                <button onclick="window.gerenciarSenhaAdmin('${item.id}', '${item.email}', '${item.user_id || ''}')" title="Gerenciar Senha" style="background:none; color:#f59e0b; padding:0; margin-right:12px;">🔑</button>
                <button onclick="window.removerUsuario('${item.id}')" title="Excluir" style="background:none; color:#ff4444; padding:0;">🗑️</button>
            </td>
        `;
    });
}

async function carregarSolicitacoesSenha() {
    const listaDiv = document.getElementById("listaSolicitacoes");
    if (!listaDiv) return;

    // Busca as solicitações
    const { data: solicitacoes, error } = await supabaseClient
        .from("solicitacoes_senha")
        .select("*")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });

    if (error) return;

    if (solicitacoes.length === 0) {
        listaDiv.innerHTML = "<p style='color:var(--muted); font-size:14px;'>Nenhuma solicitação pendente.</p>";
        return;
    }

    // Para cada solicitação, precisamos descobrir se é Aluno ou Equipe para pegar o nome
    const htmlPromises = solicitacoes.map(async (sol) => {
        let { data: perfil } = await supabaseClient.from("alunos").select("nome, email").eq("id", sol.aluno_id).maybeSingle();
        
        if (!perfil) {
            const { data: staff } = await supabaseClient.from("equipe").select("nome, email").eq("id", sol.aluno_id).maybeSingle();
            perfil = staff;
        }

        return `
        <div class="solicitacao-card">
            <div class="solicitacao-info">
                <h4>${perfil?.nome || 'Usuário Desconhecido'}</h4>
                <p>E-mail: ${perfil?.email || '---'}</p>
                <p>Data: ${new Date(sol.created_at).toLocaleDateString('pt-BR')}</p>
                <span class="status-badge badge-pendente">Pendente</span>
            </div>
            <div>
                <button onclick="window.gerenciarSenhaAdmin('${sol.aluno_id}', '${perfil?.email}')" 
                        class="btn-salvar" style="padding: 8px 12px; font-size: 12px;">Atender</button>
            </div>
        </div>
    `;
    });

    const results = await Promise.all(htmlPromises);
    listaDiv.innerHTML = results.join("");
}

async function salvarUsuario(e) {
    e.preventDefault();
    const passwordField = document.getElementById("user_password");
    const novaSenha = passwordField ? passwordField.value : "";

    const dados = {
        nome: document.getElementById("user_nome").value,
        email: document.getElementById("user_email").value,
        cpf: document.getElementById("user_cpf").value,
        role: document.getElementById("user_role").value,
        status: true // Equipe sempre ativa para acesso
    };

    // 1. Salva os dados básicos na tabela equipe
    const { error } = editUserId 
        ? await supabaseClient.from("equipe").update(dados).eq("id", editUserId)
        : await supabaseClient.from("equipe").insert([dados]);

    if (error) return mostrarToast("Erro: " + error.message, "error");

    // 2. Se uma senha foi digitada, tenta ativar/atualizar no sistema de Auth via RPC
    if (novaSenha) {
        if (novaSenha.length < 6) {
            mostrarToast("A senha deve ter pelo menos 6 caracteres. Dados salvos, mas a senha não foi alterada.", "warning");
        } else {
            const { error: pwdError } = await supabaseClient.rpc('admin_set_user_password', {
                target_user_id: null, // Deixamos nulo para o RPC buscar pelo e-mail
                new_password: novaSenha,
                target_email: dados.email
            });
            
            if (pwdError) {
                // Se o usuário ainda não existe no Auth, avisamos
                mostrarToast("Dados salvos, mas o acesso não foi ativado: " + pwdError.message, "warning");
            } else {
                mostrarToast("Senha e acesso do integrante configurados!");
            }
        }
    }

    mostrarToast("Integrante da equipe salvo!");
    if (!editUserId) mostrarToast("Lembre-se: O usuário deve criar sua senha na tela de login.", "info");
    
    resetarForm();
    carregarUsuarios();
}

window.editarUsuario = async (id) => {
    const { data: user } = await supabaseClient.from("equipe").select("*").eq("id", id).single();
    if (user) {
        document.getElementById("user_nome").value = user.nome;
        document.getElementById("user_email").value = user.email;
        document.getElementById("user_cpf").value = user.cpf || '';
        document.getElementById("user_role").value = user.role;
        
        // Garantimos que o campo de senha comece vazio para edição
        // Isso evita que apareça 'undefined' como no seu outro sistema
        if(document.getElementById("user_password")) document.getElementById("user_password").value = "";

        editUserId = id;
        document.getElementById("tituloForm").innerText = "Editar Integrante";
        document.getElementById("btnCancelar").style.display = "block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.gerenciarSenhaAdmin = (internalId, email, authId) => {
    gestaoSenhaData = { internalId, email, authId };
    const modal = document.getElementById("modalSenha");
    if (!modal) return;

    document.getElementById("infoUsuarioSenha").innerText = `Integrantes: ${email}`;
    document.getElementById("nova_senha_admin").value = "123456";
    document.getElementById("nova_senha_admin").type = "password";
    document.getElementById("toggleSenhaAdmin").innerText = "👁️";

    modal.style.display = "block";
};

window.fecharModalSenha = () => {
    document.getElementById("modalSenha").style.display = "none";
};

async function executarAcaoSenha(tipo) {
    const { internalId, email, authId } = gestaoSenhaData;

    if (tipo === 'email') {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html',
        });
        if (error) mostrarToast("Erro: " + error.message, "error");
        else mostrarToast("E-mail de recuperação enviado!");
        window.fecharModalSenha();
    } else {
        const novaSenha = document.getElementById("nova_senha_admin").value;
        if (!novaSenha || novaSenha.length < 6) return alert("A senha deve ter pelo menos 6 caracteres.");

        mostrarToast("Alterando senha...", "info");
        console.log("Chamando RPC para:", email);

        const { error } = await supabaseClient.rpc('admin_set_user_password', {
            target_user_id: authId || null,
            new_password: novaSenha,
            target_email: email
        });

        if (error) {
            console.error("Erro no RPC:", error);
            // Mostra a mensagem real vinda do banco de dados
            mostrarToast(error.message || "Erro ao processar ativação.", "error");
        } else {
            await supabaseClient.from("solicitacoes_senha").update({ status: 'atendido' }).eq("aluno_id", internalId);
            
            alert(`Senha de ${email} alterada com sucesso para: ${novaSenha}`);
            carregarSolicitacoesSenha();
            carregarUsuarios(); // Recarrega a lista para mudar de Pendente para Ativo
            window.fecharModalSenha();
        }
    }
}

window.removerUsuario = async (id) => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const { data: usuarioParaRemover } = await supabaseClient.from("equipe").select("user_id, nome").eq("id", id).single();

    if (usuarioParaRemover && usuarioParaRemover.user_id === session?.user?.id) {
        return mostrarToast("Segurança: Você não pode remover sua própria conta de administrador.", "error");
    }

    if (!confirm(`Deseja realmente remover ${usuarioParaRemover?.nome || 'este integrante'} da equipe?`)) return;

    const { error } = await supabaseClient.from("equipe").delete().eq("id", id);
    if (error) mostrarToast("Erro ao remover.", "error");
    else carregarUsuarios();
};

function resetarForm() {
    document.getElementById("formUsuario").reset();
    editUserId = null;
    document.getElementById("tituloForm").innerText = "Cadastrar Novo Integrante";
    document.getElementById("btnCancelar").style.display = "none";
}