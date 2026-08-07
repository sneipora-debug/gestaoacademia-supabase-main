import { supabaseClient } from './supabase_client.js';
import { mostrarToast, formatarMoeda, inicializarHeaderUsuario } from './utils.js';

document.addEventListener("DOMContentLoaded", async () => {
    // Inicializa o cabeçalho do usuário
    await inicializarHeaderUsuario();

    carregarConfigPix();
    carregarTabelaPlanos();

    document.getElementById("formPlano")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nome = document.getElementById('plano_nome').value;
        const valorRaw = document.getElementById('plano_valor').value;
        const valor = parseFloat(valorRaw.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;

        const { error } = await supabaseClient.from("planos").insert([{ nome, valor }]);
        if (error) return mostrarToast("Erro ao salvar plano", "error");

        mostrarToast("Plano adicionado!");
        e.target.reset();
        carregarTabelaPlanos();
    });
});

async function carregarConfigPix() {
    const { data } = await supabaseClient.from("pix_configs").select("*").single();
    if (data) {
        document.getElementById('cfg_pix_chave').value = data.chave;
        document.getElementById('cfg_pix_nome').value = data.nome;
        document.getElementById('cfg_pix_cidade').value = data.cidade;
    }
}

window.salvarConfigPix = async () => {
    const dados = {
        chave: document.getElementById('cfg_pix_chave').value,
        nome: document.getElementById('cfg_pix_nome').value,
        cidade: document.getElementById('cfg_pix_cidade').value
    };
    const { error } = await supabaseClient.from("pix_configs").upsert([dados]);
    if (error) mostrarToast("Erro ao salvar PIX", "error");
    else mostrarToast("Configurações PIX atualizadas!");
};

async function carregarTabelaPlanos() {
    const { data: planos } = await supabaseClient.from("planos").select("*").order("nome");
    const tbody = document.getElementById("tabelaConfigPlanos");
    if (!tbody) return;
    tbody.innerHTML = "";

    planos?.forEach(p => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${p.nome}</td>
            <td>${formatarMoeda(p.valor)}</td>
            <td><button class="btn-delete" data-id="${p.id}">🗑️</button></td>
        `;
        row.querySelector(".btn-delete").onclick = async () => {
            if(confirm("Remover plano?")) {
                await supabaseClient.from("planos").delete().eq("id", p.id);
                carregarTabelaPlanos();
            }
        };
    });
}