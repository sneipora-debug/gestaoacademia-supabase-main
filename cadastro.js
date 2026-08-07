import { supabaseClient } from './supabase_client.js';
import { mostrarToast, formatarMoeda, limparMoeda, calcularIMCValue, gerarMatricula, normalizarTexto, inicializarHeaderUsuario } from './utils.js';

let editId = null;

document.addEventListener("DOMContentLoaded", async () => {
    // Inicializa o cabeçalho do usuário
    await inicializarHeaderUsuario();

    const form = document.getElementById("formAluno");
    const pesoInput = document.getElementById("peso");
    const alturaInput = document.getElementById("altura");
    const imcInput = document.getElementById("imc");
    const matriculaInput = document.getElementById("matricula");

    // Inicialização
    if (matriculaInput) matriculaInput.value = gerarMatricula();
    inicializarPlanos();
    carregarAlunos();

    // Listeners de IMC
    [pesoInput, alturaInput].forEach(el => {
        el?.addEventListener("input", () => {
            imcInput.value = calcularIMCValue(pesoInput.value, alturaInput.value);
        });
    });

    // Busca
    document.getElementById("buscaNome")?.addEventListener("input", carregarAlunos);

    // Submit do Form
    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const dados = {
            nome: document.getElementById("nome").value,
            matricula: document.getElementById("matricula").value,
            cpf: document.getElementById("cpf").value || null,
            nascimento: document.getElementById("nascimento").value || null,
            sexo: document.getElementById("sexo").value,
            plano: document.getElementById("plano").value,
            valor_mensalidade: limparMoeda(document.getElementById("valor").value),
            vencimento: Math.min(Math.max(parseInt(document.getElementById("vencimento").value) || 10, 1), 28), // Limita ao dia 28 para evitar erros em fevereiro
            status: document.getElementById("status").checked,
            peso: parseFloat(pesoInput.value.replace(",", ".")) || null,
            altura: parseFloat(alturaInput.value.replace(",", ".")) || null,
            imc: imcInput.value ? parseFloat(imcInput.value.split(" - ")[0]) : null
        };

        const { error } = editId 
            ? await supabaseClient.from("alunos").update(dados).eq("id", editId)
            : await supabaseClient.from("alunos").insert([dados]);

        if (error) return mostrarToast("Erro ao salvar: " + error.message, "error");
        
        mostrarToast("Aluno salvo com sucesso!");
        form.reset();
        editId = null;
        
        // Aciona a geração de mensalidade para o novo aluno imediatamente
        await supabaseClient.rpc('gerar_mensalidades_automaticas');

        matriculaInput.value = gerarMatricula();
        carregarAlunos();
    });
});

async function carregarAlunos() {
    const termo = normalizarTexto(document.getElementById("buscaNome")?.value || "");
    const { data: alunos, error } = await supabaseClient.from("alunos").select("*").order("nome");
    
    if (error) return mostrarToast("Erro ao carregar lista", "error");

    const tabela = document.getElementById("tabelaAlunos");
    if (!tabela) return;
    tabela.innerHTML = "";

    alunos.filter(a => !termo || normalizarTexto(a.nome).includes(termo)).forEach(aluno => {
        const row = tabela.insertRow();
        row.innerHTML = `
            <td>${aluno.nome}</td>
            <td>${aluno.matricula || "---"}</td>
            <td>${aluno.plano}</td>
            <td>${formatarMoeda(aluno.valor_mensalidade)}</td>
            <td><span class="status-badge ${aluno.status ? 'pago' : 'atrasado'}">${aluno.status ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn-edit" data-id="${aluno.id}">✏️</button>
                <button class="btn-delete" data-id="${aluno.id}">🗑️</button>
            </td>
        `;
        row.querySelector(".btn-edit").onclick = () => editarAluno(aluno);
        row.querySelector(".btn-delete").onclick = () => removerAluno(aluno.id);
    });

    document.getElementById("totalAlunos").innerText = alunos.length;
    document.getElementById("alunosAtivos").innerText = alunos.filter(a => a.status).length;
}

async function inicializarPlanos() {
    const select = document.getElementById("plano");
    const { data: planos } = await supabaseClient.from("planos").select("*").order("nome");
    if (select && planos) {
        select.innerHTML = '<option value="">Selecione...</option>' + 
            planos.map(p => `<option value="${p.nome}" data-valor="${p.valor}">${p.nome}</option>`).join("");
        
        select.onchange = () => {
            const valor = select.options[select.selectedIndex].dataset.valor;
            document.getElementById("valor").value = formatarMoeda(valor || 0);
        };
    }
}

function editarAluno(aluno) {
    editId = aluno.id;
    document.getElementById("nome").value = aluno.nome;
    document.getElementById("matricula").value = aluno.matricula;
    document.getElementById("plano").value = aluno.plano;
    document.getElementById("valor").value = formatarMoeda(aluno.valor_mensalidade);
    document.getElementById("status").checked = aluno.status;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function removerAluno(id) {
    if (confirm("Excluir definitivamente?")) {
        await supabaseClient.from("alunos").delete().eq("id", id);
        carregarAlunos();
    }
}