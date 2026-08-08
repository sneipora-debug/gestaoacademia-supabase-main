import { supabaseClient } from './supabase_client.js';
import { mostrarToast, formatarMoeda, normalizarTexto, limparMoeda, imprimirRecibo, inicializarHeaderUsuario } from './utils.js';

// Garante que as funções estejam disponíveis globalmente para os botões do HTML imediatamente
window.imprimirRecibo = imprimirRecibo;
window.confirmarPagamento = async (id) => await confirmarPagamento(id);

let alunoIdAtual = null;

document.addEventListener("DOMContentLoaded", async () => {
    // Inicializa o cabeçalho do usuário
    await inicializarHeaderUsuario();

    // Garante que ao abrir o financeiro, o sistema já processou as mensalidades do mês
    try {
        await supabaseClient.rpc('gerar_mensalidades_automaticas');
    } catch (e) { console.warn("Falha na geração automática:", e); }
    
    await carregarListaSelecao();
    document.getElementById("buscaNome")?.addEventListener("input", carregarListaSelecao);
    document.getElementById("btnConfirmarTroca")?.addEventListener("click", confirmarTrocaPlano);
});

async function carregarListaSelecao() {
    const termo = normalizarTexto(document.getElementById("buscaNome")?.value || "");
    
    // HIERARQUIA: Busca o perfil para filtrar alunos por professor
    const { data: { user: authUser } } = await supabaseClient.auth.getUser();
    const { data: profile } = await supabaseClient.from("equipe").select("id, role").eq("user_id", authUser?.id).maybeSingle();

    let query = supabaseClient.from("alunos").select("*").order("nome");

    if (profile && profile.role === 'professor') {
        query = query.eq('professor_id', profile.id);
    } else if (!profile || !['master', 'admin', 'staff'].includes(profile.role)) {
        query = query.eq('user_id', authUser?.id);
    }

    const { data: alunos } = await query;
    
    const lista = document.getElementById("listaSelecaoAlunos");
    if (!lista) return;
    lista.innerHTML = "";

    alunos?.filter(a => !termo || normalizarTexto(a.nome).includes(termo)).forEach(aluno => {
        const item = document.createElement("div");
        item.className = "aluno-item-card";
        item.onclick = () => carregarFichaFinanceira(aluno.id);
        item.innerHTML = `
            <div class="aluno-avatar-circle">${aluno.nome.charAt(0)}</div>
            <div><strong>${aluno.nome}</strong><br><small>${aluno.plano}</small></div>
        `;
        lista.appendChild(item);
    });
}

window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
};

async function carregarFichaFinanceira(id) {
    alunoIdAtual = id;
    document.getElementById('detalheAluno').style.display = 'block';
    document.getElementById('msgSelecione').style.display = 'none';

    const { data: aluno } = await supabaseClient.from("alunos").select("*").eq("id", id).single();
    const [pagtos, cobs] = await Promise.all([
        supabaseClient.from("pagamentos").select("*").eq("aluno_id", id),
        supabaseClient.from("cobrancas").select("*").eq("aluno_id", id)
    ]);

    // Atualiza Perfil
    document.getElementById('profileNome').innerText = aluno.nome;
    document.getElementById('profilePlanoMatricula').innerText = `Plano: ${aluno.plano} | Matrícula: ${aluno.matricula}`;
    
    // Data de Início e Tempo de Casa
    if (aluno.created_at) {
        const inicio = new Date(aluno.created_at);
        document.getElementById('profileDataInicio').innerText = `🚀 Aluno desde: ${inicio.toLocaleDateString('pt-BR')}`;
        document.getElementById('extratoInicio').innerText = inicio.toLocaleDateString('pt-BR');
        
        const hoje = new Date();
        const diffTime = Math.abs(hoje - inicio);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        let tempoDesc = diffDays + " dia(s)";
        if (diffDays >= 30) {
            tempoDesc = Math.floor(diffDays / 30) + " mês(es)";
        }
        document.getElementById('extratoTempo').innerText = tempoDesc;
    }

    const dataMudancaElem = document.getElementById('profileDataMudanca');
    if (aluno.data_alteracao_plano) {
        dataMudancaElem.innerText = `📅 Última alteração de plano em: ${new Date(aluno.data_alteracao_plano).toLocaleDateString('pt-BR')}`;
        dataMudancaElem.style.display = 'block';
    } else {
        dataMudancaElem.style.display = 'none';
    }
    
    const historico = [
        ...(pagtos.data || []).map(p => ({ ...p, status: 'PAGO' })),
        ...(cobs.data || []).map(c => ({ ...c }))
    ].sort((a, b) => new Date(b.vencimento || b.data) - new Date(a.vencimento || a.data));

    renderizarTabelaFinanceira(aluno, historico);
    renderizarTransparenciaPlanos(aluno, historico);
}

function renderizarTabelaFinanceira(aluno, historico) {
    const corpo = document.getElementById("extratoTabelaCorpo");
    corpo.innerHTML = "";
    
    let pagoTotal = 0;
    let atrasadoTotal = 0;

    historico.forEach(item => {
        const row = corpo.insertRow();
        const isPago = item.status === 'PAGO';
        if(isPago) pagoTotal += item.valor;
        else if(item.status === 'ATRASADO') atrasadoTotal += item.valor;

        // Verifica se esta parcela é posterior à mudança de plano para mostrar um alerta visual
        const isPosMudanca = !isPago && aluno.data_alteracao_plano && (item.vencimento >= aluno.data_alteracao_plano);
        const alertaNovoPlano = isPosMudanca ? ` <span style="color:var(--primary); font-size:10px; font-weight:bold;" title="Valor atualizado conforme novo plano">(NOVO)</span>` : '';

        row.innerHTML = `
            <td>${item.referencia || item.competencia}</td>
            <td>${new Date(item.vencimento || item.data).toLocaleDateString('pt-BR')}</td>
            <td style="${isPosMudanca ? 'border-left: 2px solid var(--primary);' : ''}">${formatarMoeda(item.valor)}${alertaNovoPlano}</td>
            <td><span class="badge-pagamento ${item.status.toLowerCase()}">${item.status}</span></td>
            <td>
                ${isPago 
                    ? `<button class="btn-recibo" onclick="window.imprimirRecibo('${aluno.id}', '${item.referencia}')">📄</button>` 
                    : `<button class="btn-pagar" onclick="confirmarPagamento('${item.id}')">✅</button>`}
            </td>
        `;
    });

    document.getElementById("extratoPago").innerText = formatarMoeda(pagoTotal);
    document.getElementById("extratoAtrasado").innerText = formatarMoeda(atrasadoTotal);
}

function renderizarTransparenciaPlanos(aluno, historico) {
    const container = document.getElementById("transparenciaPlanos");
    const timeline = document.getElementById("timelineEras");
    if (!container || !timeline || historico.length === 0) return;

    // Ordena cronologicamente para calcular as "eras"
    const historicoCron = [...historico].sort((a, b) => new Date(a.vencimento || a.data) - new Date(b.vencimento || b.data));
    
    const eras = [];
    let eraAtual = {
        valor: historicoCron[0].valor,
        inicio: historicoCron[0].referencia || historicoCron[0].competencia,
        meses: 0
    };

    historicoCron.forEach((item, index) => {
        if (item.valor === eraAtual.valor) {
            eraAtual.meses++;
            eraAtual.fim = item.referencia || item.competencia;
        } else {
            eras.push({...eraAtual});
            eraAtual = {
                valor: item.valor,
                inicio: item.referencia || item.competencia,
                fim: item.referencia || item.competencia,
                meses: 1
            };
        }
        if (index === historicoCron.length - 1) eras.push(eraAtual);
    });

    timeline.innerHTML = "";
    eras.reverse().forEach(era => {
        const card = document.createElement("div");
        card.className = "resumo-item";
        card.style.minWidth = "160px";
        card.style.flex = "0 0 auto";
        card.style.borderTop = era.valor === aluno.valor_mensalidade ? "3px solid var(--primary)" : "3px solid #334155";
        card.innerHTML = `
            <small style="font-size:9px;">${era.inicio} ➜ ${era.fim}</small>
            <strong style="display:block; font-size:14px;">${formatarMoeda(era.valor)}</strong>
            <span style="font-size:10px; color:var(--muted)">${era.meses} meses</span>
        `;
        timeline.appendChild(card);
    });
    container.style.display = "block";
}

async function confirmarPagamento(cobrancaId) {
    const { data: cob } = await supabaseClient.from("cobrancas").select("*").eq("id", cobrancaId).single();
    
    await supabaseClient.from("pagamentos").insert([{
        aluno_id: cob.aluno_id,
        nome: cob.nome,
        valor: cob.valor,
        data: new Date().toISOString(),
        referencia: cob.competencia
    }]);

    await supabaseClient.from("cobrancas").delete().eq("id", cobrancaId);
    mostrarToast("Pagamento registrado!");
    carregarFichaFinanceira(cob.aluno_id);
}

window.togglePlanSwitcher = async () => {
    const div = document.getElementById('planSwitcher');
    if (div.style.display === 'none') {
        const { data: planos } = await supabaseClient.from("planos").select("*").order("nome");
        const select = document.getElementById('selectTrocarPlano');
        select.innerHTML = planos.map(p => `<option value="${p.nome}" data-valor="${p.valor}">${p.nome} (${formatarMoeda(p.valor)})</option>`).join("");
        div.style.display = 'flex';
    } else {
        div.style.display = 'none';
    }
};

async function confirmarTrocaPlano() {
    if (!alunoIdAtual) return;
    const select = document.getElementById('selectTrocarPlano');
    const novoPlano = select.value;
    const novoValor = parseFloat(select.options[select.selectedIndex].dataset.valor);

    if (!confirm(`Confirmar mudança para o plano ${novoPlano}? As cobranças futuras serão atualizadas.`)) return;

    const hoje = new Date();
    const dataIso = hoje.toISOString().split('T')[0];
    // Define o primeiro dia do próximo mês para atualizar cobranças futuras
    const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().split('T')[0];

    // 1. Atualiza o cadastro do aluno
    const { error: errAluno } = await supabaseClient
        .from("alunos")
        .update({ plano: novoPlano, valor_mensalidade: novoValor, data_alteracao_plano: dataIso })
        .eq("id", alunoIdAtual);

    if (errAluno) return mostrarToast("Erro ao atualizar plano.", "error");

    // 2. Atualiza apenas cobranças PENDENTES futuras (não altera dívidas passadas)
    await supabaseClient
        .from("cobrancas")
        .update({ valor: novoValor })
        .eq("aluno_id", alunoIdAtual)
        .eq("status", "PENDENTE")
        .gte("vencimento", proximoMes);

    mostrarToast(`Plano atualizado com sucesso!`);
    document.getElementById('planSwitcher').style.display = 'none';
    carregarFichaFinanceira(alunoIdAtual);
}
