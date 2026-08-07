import { supabaseClient } from './supabase_client.js';
import { mostrarToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const resetForm = document.getElementById('resetForm');

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const btn = e.target.querySelector('button');

        if (newPassword !== confirmPassword) {
            mostrarToast("As senhas não coincidem!", "error");
            return;
        }

        btn.innerText = "Processando...";
        btn.disabled = true;

        // O Supabase identifica o usuário automaticamente pelo token na URL
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) {
            mostrarToast("Erro: " + error.message, "error");
            btn.innerText = "Atualizar e Entrar";
            btn.disabled = false;
        } else {
            alert("Senha atualizada com sucesso! Você será redirecionado.");
            window.location.href = 'login.html';
        }
    });
});