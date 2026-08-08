import { supabaseClient } from './supabase_client.js';
import { formatarMoeda, inicializarHeaderUsuario } from './utils.js';

document.addEventListener("DOMContentLoaded", async () => {
    // Inicializa o cabeçalho do usuário
    await inicializarHeaderUsuario();

    // Acorda o banco de dados para conferir se precisa gerar parcelas novas para o mês atual
    try {
        await supabaseClient.rpc('gerar_mensalidades_automaticas');
    } catch (e) { console.warn("Falha ao gerar mensalidades:", e); }

    // HIERARQUIA: Filtra alunos baseado no perfil logado
    const { data: userData } = await supabaseClient.auth.getUser();
    const authUser = userData?.user;

    let query = supabaseClient.from("alunos").select("*");

    if (authUser) {
        const { data: profile } = await supabaseClient.from("equipe").select("id, role").eq("user_id", authUser.id).maybeSingle();
        if (profile && profile.role === 'professor') {
            query = query.eq('professor_id', profile.id);
        }
    }


    const { data: alunos } = await query;
        
    const { data: pagamentos } = await supabaseClient.from("pagamentos").select("*");
    const { data: cobrancas } = await supabaseClient.from("cobrancas").select("*");

    const ativos = alunos?.filter(a => a.status).length || 0;
    const receitaMensal = pagamentos?.reduce((acc, p) => acc + p.valor, 0) || 0;
    const pendenteMes = cobrancas?.filter(c => c.status === 'PENDENTE').reduce((acc, c) => acc + c.valor, 0) || 0;
    const inadimplentes = cobrancas?.filter(c => c.status === 'ATRASADO').reduce((acc, c) => acc + c.valor, 0) || 0;

    document.getElementById("alunosAtivos").innerText = ativos;
    document.getElementById("receitaMensal").innerText = formatarMoeda(receitaMensal);
    document.getElementById("totalPendenteMes").innerText = formatarMoeda(pendenteMes);
    document.getElementById("totalInadimplentes").innerText = formatarMoeda(inadimplentes);
    document.getElementById("receitaPrevista").innerText = formatarMoeda(receitaMensal + pendenteMes);

    inicializarGrafico(alunos);
});

function inicializarGrafico(alunos) {
    const ctx = document.getElementById('graficoPlanos')?.getContext('2d');
    if (!ctx || !alunos) return;

    const contagem = {};
    alunos.forEach(a => contagem[a.plano] = (contagem[a.plano] || 0) + 1);

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(contagem),
            datasets: [{
                data: Object.values(contagem),
                backgroundColor: ['#FFD400', '#22C55E', '#3b82f6', '#ef4444', '#a855f7'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#AAB3C5', font: { family: 'Inter' } }
                }
            }
        }
    });
}