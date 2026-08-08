import { supabaseClient } from './supabase_client.js';

// Funções Utilitárias Compartilhadas
export const normalizarTexto = (txt) =>
  String(txt).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const limparMoeda = (valor) =>
  parseFloat(String(valor).replace(/[R$\s.]/g, "").replace(",", ".")) || 0;

export const formatarMoeda = (valor) =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const mostrarToast = (msg, tipo = "success") => {
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

export const imprimirRecibo = async (alunoId, ref) => {
  if (!supabaseClient) return; //

  // Abrimos a aba imediatamente para evitar o bloqueio de pop-up do navegador
  const novaAba = window.open("", "_blank");
  if (!novaAba) return mostrarToast("Pop-up bloqueado! Permita pop-ups para este site.", "error");
  novaAba.document.write("<html><body><h3>Carregando recibo...</h3></body></html>");

  mostrarToast("Buscando dados...", "info");
  const { data: aluno } = await supabaseClient.from("alunos").select("*").eq("id", alunoId).single();
  const { data: pagto } = await supabaseClient.from("pagamentos")
    .select("*")
    .eq("aluno_id", alunoId)
    .eq("referencia", ref)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!aluno || !pagto) {
    novaAba.close();
    return mostrarToast("Dados de pagamento não encontrados.", "error");
  }

  novaAba.document.open();
  novaAba.document.write(`
    <html>
      <head>
        <title>Recibo - Sou Fitness</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; width: 320px; padding: 20px; margin: 0 auto; color: #000; background: #fff; border: 1px solid #eee; }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
          .content { font-size: 13px; line-height: 1.5; }
          .row { display: flex; justify-content: space-between; }
          .total-box { font-size: 16px; font-weight: bold; margin-top: 10px; border-top: 2px double #000; padding-top: 8px; }
          .footer { text-align: center; border-top: 1px dashed #000; padding-top: 10px; margin-top: 20px; font-size: 11px; }
          .btn-print { background: #000; color: #fff; border: none; padding: 10px; cursor: pointer; width: 100%; margin-top: 20px; font-weight: bold; font-family: inherit; }
          @media print { .no-print { display: none; } body { border: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <strong>SOU FITNESS ACADEMIA</strong><br>
          *** RECIBO DE PAGAMENTO ***
        </div>
        <div class="content">
          <strong>ALUNO:</strong> ${aluno.nome.toUpperCase()}<br>
          <strong>MATRÍCULA:</strong> ${aluno.matricula || '---'}<br>
          <div style="margin: 15px 0; border-top: 1px solid #ccc;"></div>
          <div class="row"><span>Competência:</span> <span>${pagto.referencia}</span></div>
          <div class="row"><span>Data Pagto:</span> <span>${new Date(pagto.data).toLocaleDateString('pt-BR')}</span></div>
          <div class="total-box">
            <span>VALOR PAGO:</span> <span>${formatarMoeda(pagto.valor)}</span>
          </div>
        </div>
        <div class="footer">
          Comprovante emitido em: ${new Date().toLocaleString('pt-BR')}<br>
          <button class="btn-print no-print" onclick="window.print()">IMPRIMIR</button>
        </div>
      </body>
    </html>
  `);
  novaAba.document.close();
};

export const gerarPix = async (alunoId, valor) => {
  if (!supabaseClient) return;
  
  const { data: config } = await supabaseClient.from("pix_configs").select("*").limit(1).single();
  if (!config || !config.chave) return mostrarToast("Chave PIX não configurada pelo administrador.", "error");

  const vStr = parseFloat(valor).toFixed(2);
  const payload = `00020126360014BR.GOV.BCB.PIX01${config.chave.length}${config.chave}52040000530398654${vStr.length}${vStr}5802BR59${config.nome.length}${config.nome}60${config.cidade.length}${config.cidade}62070503***6304`;
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
  const novaAba = window.open("", "_blank");
  
  novaAba.document.write(`
    <html>
      <head><title>Pagamento PIX</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f4f4f4; color:#333;}</style></head>
      <body>
        <h2>Pagamento via PIX</h2>
        <p>Valor: <strong>${formatarMoeda(valor)}</strong></p>
        <img src="${qrUrl}" alt="QR Code PIX">
        <p><br>Aponte a câmera do seu banco para o código acima.</p>
      </body>
    </html>
  `);
};

export const calcularIMCValue = (peso, altura) => {
  const p = parseFloat(String(peso).replace(",", "."));
  let a = parseFloat(String(altura).replace(",", "."));
  if (p > 0 && a > 0) {
    if (a > 3) a = a / 100;
    const imc = (p / (a * a)).toFixed(2);
    let classe = "";
    if (imc < 18.5) classe = "Abaixo do peso";
    else if (imc < 25) classe = "Peso Normal";
    else if (imc < 30) classe = "Sobrepeso";
    else if (imc < 35) classe = "Obesidade Grau I";
    else if (imc < 40) classe = "Obesidade Grau II";
    else classe = "Obesidade Grau III";
    return `${imc} - ${classe}`;
  }
  return "";
};

export const gerarMatricula = () => {
    const ano = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${ano}${random}`;
};

export const inicializarHeaderUsuario = async () => {
    const headerContainer = document.querySelector('.user-header');
    if (!headerContainer) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    // Busca o perfil primeiro na equipe, depois em alunos
    let { data: profile } = await supabaseClient
        .from('equipe')
        .select('nome, role')
        .eq('user_id', session.user.id)
        .maybeSingle();

    if (!profile) {
        const { data: student } = await supabaseClient
            .from('alunos')
            .select('nome')
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (student) profile = { ...student, role: 'student' };
    }

    headerContainer.innerHTML = `
        <button id="btnToggleMenu" class="btn-toggle-menu" title="Alternar Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
        </button>
        <div class="user-right-section">
            <div class="user-info-box">
                <span class="user-info-name">${profile?.nome || 'Usuário'}</span>
                <span class="user-info-role">${profile?.role === 'master' ? '👑 Master' : profile?.role === 'admin' ? '🏢 Empresário' : profile?.role === 'professor' ? '👨‍🏫 Professor' : '🤝 Colaborador'}</span>
            </div>
            <button class="btn-logout-header" id="btnLogoutHeader">Sair</button>
        </div>
    `;

    // Lógica para esconder/mostrar o menu lateral
    const menu = document.getElementById('menu');
    const btnToggle = document.getElementById('btnToggleMenu');

    // Restaurar estado do menu do navegador (se o usuário deixou fechado antes)
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        menu?.classList.add('collapsed');
    }

    btnToggle?.addEventListener('click', () => {
        if (menu) {
            menu.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', menu.classList.contains('collapsed'));
        }
    });

    document.getElementById('btnLogoutHeader')?.addEventListener('click', async () => {
        if (!confirm("Deseja realmente sair do sistema?")) return;
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });
};