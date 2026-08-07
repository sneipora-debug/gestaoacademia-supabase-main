import { supabaseClient } from './supabase_client.js';
import { mostrarToast, normalizarTexto, inicializarHeaderUsuario } from './utils.js';

let editUserId = null;

document.addEventListener("DOMContentLoaded", async () => {
    // Inicializa o cabeçalho do usuário
    await inicializarHeaderUsuario();

    carregarUsuarios();
    document.getElementById("formUsuario")?.addEventListener("submit", salvarUsuario);
    document.getElementById("btnCancelar")?.addEventListener("click", resetarForm);
});

async function carregarUsuarios() {
    // Busca todos os integrantes que NÃO possuem role 'student' (vazio assume student por padrão)
    const { data: usuarios, error } = await supabaseClient
        .from("alunos")
        .select("*")
        .not("role", "eq", "student")
        .order("nome");

    if (error) return mostrarToast("Erro ao carregar usuários.", "error");

    const tabela = document.getElementById("tabelaUsuarios");
    if (!tabela) return;
    tabela.innerHTML = "";

    usuarios.forEach(user => {
        const row = tabela.insertRow();
        const roleMap = { 'admin': 'Administrador', 'professor': 'Professor', 'staff': 'Recepcionista' };
        
        row.innerHTML = `
            <td><strong>${user.nome}</strong></td>
            <td>${user.email}</td>
            <td>${user.cpf || '---'}</td>
            <td><span class="status-badge ${user.role === 'admin' ? 'pago' : 'atrasado'}">${roleMap[user.role] || user.role}</span></td>
            <td>
                <button onclick="window.editarUsuario('${user.id}')" title="Editar" style="background:none; color:var(--primary); padding:0; margin-right:12px;">✏️</button>
                <button onclick="window.gerenciarSenhaAdmin('${user.id}', '${user.email}')" title="Gerenciar Senha" style="background:none; color:#f59e0b; padding:0; margin-right:12px;">🔑</button>
                <button onclick="window.removerUsuario('${user.id}')" title="Excluir" style="background:none; color:#ff4444; padding:0;">🗑️</button>
            </td>
        `;
    });
}

async function salvarUsuario(e) {
    e.preventDefault();
    const dados = {
        nome: document.getElementById("user_nome").value,
        email: document.getElementById("user_email").value,
        cpf: document.getElementById("user_cpf").value,
        role: document.getElementById("user_role").value,
        status: true // Equipe sempre ativa para acesso
    };

    const { error } = editUserId 
        ? await supabaseClient.from("alunos").update(dados).eq("id", editUserId)
        : await supabaseClient.from("alunos").insert([dados]);

    if (error) return mostrarToast("Erro: " + error.message, "error");

    mostrarToast("Integrante da equipe salvo!");
    if (!editUserId) mostrarToast("Lembre-se: O usuário deve criar sua senha na tela de login.", "info");
    
    resetarForm();
    carregarUsuarios();
}

window.editarUsuario = async (id) => {
    const { data: user } = await supabaseClient.from("alunos").select("*").eq("id", id).single();
    if (user) {
        document.getElementById("user_nome").value = user.nome;
        document.getElementById("user_email").value = user.email;
        document.getElementById("user_cpf").value = user.cpf || '';
        document.getElementById("user_role").value = user.role;
        editUserId = id;
        document.getElementById("tituloForm").innerText = "Editar Integrante";
        document.getElementById("btnCancelar").style.display = "block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.gerenciarSenhaAdmin = async (userId, email) => {
    const opcao = confirm(`Deseja enviar um e-mail de recuperação para ${email}?\n\n(Clique em CANCELAR para definir uma senha manualmente agora)`);

    if (opcao) {
        // Tenta enviar e-mail
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html',
        });
        if (error) {
            mostrarToast("Erro ao enviar e-mail: " + error.message, "error");
            console.error("Dica: Verifique se as Redirect URLs estão configuradas no Supabase.");
        } else {
            mostrarToast("E-mail de recuperação enviado!");
        }
    } else {
        // Redefinição manual pelo Admin
        const novaSenha = prompt(`Digite a nova senha para o usuário ${email}:`);
        if (!novaSenha || novaSenha.length < 6) {
            return alert("A senha deve ter pelo menos 6 caracteres.");
        }

        const { error } = await supabaseClient.rpc('admin_set_user_password', {
            target_user_id: userId,
            new_password: novaSenha
        });

        if (error) mostrarToast("Erro ao definir senha: " + error.message, "error");
        else mostrarToast("Senha alterada com sucesso pelo administrador!");
    }
};

window.removerUsuario = async (id) => {
    if (!confirm("Remover este integrante da equipe?")) return;
    const { error } = await supabaseClient.from("alunos").delete().eq("id", id);
    if (error) mostrarToast("Erro ao remover.", "error");
    else carregarUsuarios();
};

function resetarForm() {
    document.getElementById("formUsuario").reset();
    editUserId = null;
    document.getElementById("tituloForm").innerText = "Cadastrar Novo Integrante";
    document.getElementById("btnCancelar").style.display = "none";
}