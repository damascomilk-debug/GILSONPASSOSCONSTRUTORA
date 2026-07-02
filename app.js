/* ============================================================
   GILSON PASSOS CONSTRUTORA — Sistema Financeiro
   app.js — Lógica completa do sistema
   ============================================================ */

// ======================================
// STORE (localStorage persistence)
// ======================================
const SESSION_KEY = 'gp_session';

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return getDefaultDB();
    const parsed = JSON.parse(raw);
    const defaults = getDefaultDB();
    // Merge defaults to guarantee all collections are initialized (local-first resilience)
    return { ...defaults, ...parsed };
  } catch { return getDefaultDB(); }
}

let _isSyncing = false;
let _pendingSync = false;

async function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  localStorage.setItem(DB_KEY + '_last_local_edit', new Date().toISOString());
  
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    updateAppSyncStatus(false, 'Sincronizando...');
    
    if (_isSyncing) {
      _pendingSync = true;
      return;
    }
    
    _isSyncing = true;
    try {
      await syncToSupabase();
      updateAppSyncStatus(true, 'Sincronizado');
      showToast("Nuvem atualizada.");
    } catch (err) {
      updateAppSyncStatus(false, 'Erro ao sincronizar');
      console.error("Erro na sincronização automática para o Supabase:", err);
      showToast("Falha ao salvar na nuvem: " + err.message, "error");
    } finally {
      _isSyncing = false;
      if (_pendingSync) {
        _pendingSync = false;
        saveDB(DB);
      }
    }
  }
}

function getDefaultDB() {
  return {
    // Entidades pré-cadastradas
    entidades: [
      { id: 1, nome: 'GILSON',  tipo: 'MEI', cnpj: '67.309.597/0001-21', limiteAnual: 8100000, parId: 4, ativo: true },
      { id: 2, nome: 'RAMILLY', tipo: 'MEI', cnpj: '67.309.298/0001-97', limiteAnual: 8100000, parId: 5, ativo: true },
      { id: 3, nome: 'LUSIMAR', tipo: 'MEI', cnpj: '67.310.098/0001-54', limiteAnual: 8100000, parId: 6, ativo: true },
      { id: 4, nome: 'GILSON',  tipo: 'PF',  cnpj: null, limiteMensal: 500000, parId: 1, ativo: true },
      { id: 5, nome: 'RAMILLY', tipo: 'PF',  cnpj: null, limiteMensal: 500000, parId: 2, ativo: true },
      { id: 6, nome: 'LUSIMAR', tipo: 'PF',  cnpj: null, limiteMensal: 500000, parId: 3, ativo: true },
      { id: 7, nome: 'CAIXA GERAL', tipo: 'CAIXA', cnpj: null, parId: null, ativo: true },
    ],
    bancos: [],
    obras: [],
    recebimentos: [],
    caixaMovimentos: [],
    funcionarios: [],
    semanaPagamento: [],
    registrosPonto: [],
    empreitadas: [],
    pagamentos: [],
    despesas: [],
    // Módulo Pessoal
    gastosPessoais: [],
    orcamentoMensal: [],
    // Módulo Checklist Semanal
    checklistTopicos: [],
    checklistTarefas: [],
    // Módulo Agenda
    agendaEventos: [],
    // sequências de ID
    seq: { bancos: 1, obras: 1, recebimentos: 1, caixaMovimentos: 1, funcionarios: 1, semanaPagamento: 1, registrosPonto: 1, empreitadas: 1, pagamentos: 1, despesas: 1, gastosPessoais: 1, orcamentoMensal: 1, checklistTopicos: 1, checklistTarefas: 1, agendaEventos: 1 }
  };
}

let DB = loadDB();

// Filtros de Período de Referência Global
let globalFiltroTipo = 'MENSAL'; // 'MENSAL', 'INTERVALO'
let globalFiltroMes = new Date().getMonth() + 1;
let globalFiltroAno = new Date().getFullYear();
let globalFiltroMesFim = new Date().getMonth() + 1;
let globalFiltroAnoFim = new Date().getFullYear();

function isPeriodoValido(mes, ano) {
  if (globalFiltroTipo === 'MENSAL') {
    const matchMes = (globalFiltroMes === 'all' || mes == globalFiltroMes);
    const matchAno = (globalFiltroAno === 'all' || ano == globalFiltroAno);
    return matchMes && matchAno;
  }
  if (globalFiltroTipo === 'INTERVALO') {
    const startMes = globalFiltroMes === 'all' ? 1 : parseInt(globalFiltroMes);
    const startAno = globalFiltroAno === 'all' ? new Date().getFullYear() : parseInt(globalFiltroAno);
    const endMes = globalFiltroMesFim === 'all' ? 12 : parseInt(globalFiltroMesFim);
    const endAno = globalFiltroAnoFim === 'all' ? new Date().getFullYear() : parseInt(globalFiltroAnoFim);

    const valItem = parseInt(ano) * 12 + parseInt(mes);
    const valStart = startAno * 12 + startMes;
    const valEnd = endAno * 12 + endMes;
    return valItem >= valStart && valItem <= valEnd;
  }
  return true;
}

function isDataValida(dateStr) {
  if (!dateStr) return false;
  const [y, m] = dateStr.split('-').map(Number);
  return isPeriodoValido(m, y);
}

function getPeriodoFormatado() {
  if (globalFiltroTipo === 'MENSAL') {
    if (globalFiltroMes === 'all' && globalFiltroAno === 'all') return 'Todos os Períodos';
    if (globalFiltroMes === 'all') return `Todos os meses de ${globalFiltroAno}`;
    if (globalFiltroAno === 'all') return `${monthName(globalFiltroMes)} (Todos os anos)`;
    return `${monthName(globalFiltroMes)}/${globalFiltroAno}`;
  }
  if (globalFiltroTipo === 'INTERVALO') {
    return `De ${monthName(globalFiltroMes)}/${globalFiltroAno} a ${monthName(globalFiltroMesFim)}/${globalFiltroAnoFim}`;
  }
  return 'Todos os Períodos';
}

const NOME_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function renderMonthSelectOptions(selectedMonth, includeAll = false) {
  let html = '';
  if (includeAll) {
    html += `<option value="all" ${selectedMonth === 'all' ? 'selected' : ''}>Todos os Meses</option>`;
  }
  html += NOME_MESES.map((nome, idx) => `<option value="${idx + 1}" ${selectedMonth == idx + 1 ? 'selected' : ''}>${nome}</option>`).join('');
  return html;
}

function renderYearSelectOptions(selectedYear, includeAll = false) {
  let html = '';
  if (includeAll) {
    html += `<option value="all" ${selectedYear === 'all' ? 'selected' : ''}>Todos os Anos</option>`;
  }
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 2; y <= currentYear + 3; y++) {
    years.push(y);
  }
  html += years.map(y => `<option value="${y}" ${selectedYear == y ? 'selected' : ''}>${y}</option>`).join('');
  return html;
}

function renderPeriodFilterCard(label = 'Período de Referência') {
  if (!globalFiltroTipo) globalFiltroTipo = 'MENSAL';
  if (!globalFiltroMes) globalFiltroMes = new Date().getMonth() + 1;
  if (!globalFiltroAno) globalFiltroAno = new Date().getFullYear();
  if (!globalFiltroMesFim) globalFiltroMesFim = new Date().getMonth() + 1;
  if (!globalFiltroAnoFim) globalFiltroAnoFim = new Date().getFullYear();

  const isMensal = (globalFiltroTipo === 'MENSAL');
  const isIntervalo = (globalFiltroTipo === 'INTERVALO');

  return `
  <!-- Filtro de Período Global -->
  <div class="card" style="margin-bottom: 20px; padding: 16px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
      <span style="font-size:14px; font-weight:700; color:var(--text-primary);">${label}</span>
      <div style="display:flex; gap:8px;">
        <button class="btn-secondary" style="padding:4px 10px; font-size:12px; background:${isMensal ? 'var(--primary)' : ''}; color:${isMensal ? 'white' : ''}; border-color:${isMensal ? 'var(--primary)' : ''}" onclick="setGlobalPeriodTipo('MENSAL')">📅 Mês Único</button>
        <button class="btn-secondary" style="padding:4px 10px; font-size:12px; background:${isIntervalo ? 'var(--primary)' : ''}; color:${isIntervalo ? 'white' : ''}; border-color:${isIntervalo ? 'var(--primary)' : ''}" onclick="setGlobalPeriodTipo('INTERVALO')">🗓️ Intervalo de Meses</button>
      </div>
    </div>
    
    <div class="grid-2" style="gap: 14px; align-items: flex-end;">
      ${isMensal ? `
        <div class="form-group" style="margin-bottom: 0;">
          <label style="margin-bottom: 4px;">Mês</label>
          <select id="globalFiltroMes" onchange="onGlobalPeriodChange()">
            ${renderMonthSelectOptions(globalFiltroMes, true)}
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="margin-bottom: 4px;">Ano</label>
          <select id="globalFiltroAno" onchange="onGlobalPeriodChange()">
            ${renderYearSelectOptions(globalFiltroAno, true)}
          </select>
        </div>
      ` : `
        <div class="form-group" style="margin-bottom: 0;">
          <label style="margin-bottom: 4px;">De (Mês/Ano)</label>
          <div style="display:flex; gap:6px;">
            <select id="globalFiltroMes" onchange="onGlobalPeriodChange()" style="flex:1;">
              ${renderMonthSelectOptions(globalFiltroMes, false)}
            </select>
            <select id="globalFiltroAno" onchange="onGlobalPeriodChange()" style="flex:1;">
              ${renderYearSelectOptions(globalFiltroAno, false)}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="margin-bottom: 4px;">Até (Mês/Ano)</label>
          <div style="display:flex; gap:6px;">
            <select id="globalFiltroMesFim" onchange="onGlobalPeriodChange()" style="flex:1;">
              ${renderMonthSelectOptions(globalFiltroMesFim, false)}
            </select>
            <select id="globalFiltroAnoFim" onchange="onGlobalPeriodChange()" style="flex:1;">
              ${renderYearSelectOptions(globalFiltroAnoFim, false)}
            </select>
          </div>
        </div>
      `}
    </div>
  </div>`;
}

function setGlobalPeriodTipo(tipo) {
  globalFiltroTipo = tipo;
  if (tipo === 'INTERVALO') {
    if (globalFiltroMes === 'all') globalFiltroMes = 1;
    if (globalFiltroAno === 'all') globalFiltroAno = new Date().getFullYear();
    globalFiltroMesFim = globalFiltroMes;
    globalFiltroAnoFim = globalFiltroAno;
  }
  renderPage(currentPage);
}

function onGlobalPeriodChange() {
  const mesSelect = document.getElementById('globalFiltroMes');
  const anoSelect = document.getElementById('globalFiltroAno');
  const mesFimSelect = document.getElementById('globalFiltroMesFim');
  const anoFimSelect = document.getElementById('globalFiltroAnoFim');

  if (mesSelect) {
    const valMes = mesSelect.value;
    globalFiltroMes = valMes === 'all' ? 'all' : parseInt(valMes);
  }
  if (anoSelect) {
    const valAno = anoSelect.value;
    globalFiltroAno = valAno === 'all' ? 'all' : parseInt(valAno);
  }
  if (mesFimSelect) {
    globalFiltroMesFim = parseInt(mesFimSelect.value);
  }
  if (anoFimSelect) {
    globalFiltroAnoFim = parseInt(anoFimSelect.value);
  }

  // Validação cronológica para o modo intervalo
  if (globalFiltroTipo === 'INTERVALO' && globalFiltroAno && globalFiltroMes && globalFiltroAnoFim && globalFiltroMesFim) {
    const startVal = parseInt(globalFiltroAno) * 12 + parseInt(globalFiltroMes);
    const endVal = parseInt(globalFiltroAnoFim) * 12 + parseInt(globalFiltroMesFim);
    if (startVal > endVal) {
      showToast("A data de término não pode ser anterior à data de início.", "warning");
      globalFiltroMesFim = globalFiltroMes;
      globalFiltroAnoFim = globalFiltroAno;
    }
  }

  renderPage(currentPage);
}



function nextId(entity) {
  const id = DB.seq[entity] || 1;
  DB.seq[entity] = id + 1;
  saveDB(DB);
  return id;
}

// ======================================
// AUTH
// ======================================
function loadAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch { return null; }
}
function saveAuth(data) { localStorage.setItem(AUTH_KEY, JSON.stringify(data)); }
function isLoggedIn() { return !!localStorage.getItem(SESSION_KEY); }
function setSession(email) { localStorage.setItem(SESSION_KEY, email); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');

  if (!email || !pass) {
    err.textContent = 'Por favor, preencha todos os campos.';
    err.classList.remove('hidden');
    return;
  }

  if (!supabaseClient) {
    err.textContent = 'Supabase não configurado. Configure a conexão clicando na engrenagem.';
    err.classList.remove('hidden');
    return;
  }

  // Disable button
  const btn = document.getElementById('loginBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  err.classList.add('hidden');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: pass
    });

    if (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } else if (data?.user) {
      setSession(data.user.email);
      showApp(data.user.email);
    }
  } catch (e) {
    err.textContent = 'Erro ao realizar login: ' + e.message;
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function doSetup() {
  const email = document.getElementById('setupEmail').value.trim();
  const pass  = document.getElementById('setupPassword').value;
  const pass2 = document.getElementById('setupPasswordConfirm').value;
  const err   = document.getElementById('setupError');

  if (!email || !pass) { err.textContent = 'Preencha todos os campos.'; err.classList.remove('hidden'); return; }
  if (pass !== pass2) { err.textContent = 'As senhas não coincidem.'; err.classList.remove('hidden'); return; }
  if (pass.length < 6) { err.textContent = 'Senha deve ter ao menos 6 caracteres.'; err.classList.remove('hidden'); return; }

  if (!supabaseClient) {
    err.textContent = 'Supabase não configurado. Configure a conexão primeiro.';
    err.classList.remove('hidden');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: pass
    });

    if (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } else if (data?.user) {
      if (data.session) {
        setSession(data.user.email);
        showApp(data.user.email);
      } else {
        alert('Conta criada com sucesso! Por favor, verifique seu e-mail para confirmar antes de fazer o login.');
        showLogin();
      }
    }
  } catch (e) {
    err.textContent = 'Erro ao criar conta: ' + e.message;
    err.classList.remove('hidden');
  }
}

async function doLogout() {
  clearSession();
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.error("Erro ao fazer logout no Supabase:", e);
    }
  }
  window.location.reload();
}

function showSetup() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('setupScreen').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function showApp(email) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const initials = email.slice(0,2).toUpperCase();
  document.querySelector('.user-avatar').textContent = initials;
  document.getElementById('sidebarUserName').textContent = email.split('@')[0];
  navigate('dashboard');
}

function updateSupaStatusIndicator(connected) {
  const indicator = document.getElementById('loginSupaStatusIndicator');
  const text = document.getElementById('loginSupaStatusText');
  if (indicator && text) {
    if (connected) {
      indicator.className = 'status-indicator connected';
      text.textContent = 'Conectado ao Supabase';
    } else {
      indicator.className = 'status-indicator disconnected';
      text.textContent = 'Desconectado do Supabase';
    }
  }
}

async function initializeApp() {
  document.getElementById('loginPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('setupPasswordConfirm')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
  
  initSupabase();
  
  if (!supabaseClient) {
    updateSupaStatusIndicator(false);
    updateAppSyncStatus(false, 'Sem Conexão');
    showLogin();
    return;
  }
  
  updateSupaStatusIndicator(true);
  updateAppSyncStatus(true, 'Sincronizado');
  
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (data?.session) {
      setSession(data.session.user.email);
      // Sincroniza os dados da nuvem na inicialização
      try {
        updateAppSyncStatus(false, 'Sincronizando...');
        await syncFromSupabase();
        updateAppSyncStatus(true, 'Sincronizado');
      } catch (syncErr) {
        console.error("Erro ao sincronizar dados da nuvem na inicialização:", syncErr);
        updateAppSyncStatus(false, 'Erro ao sincronizar');
      }
      showApp(data.session.user.email);
    } else {
      clearSession();
      showLogin();
    }
  } catch (e) {
    console.error("Erro ao verificar sessão do Supabase:", e);
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);

// ======================================
// NAVIGATION
// ======================================
let currentPage = 'dashboard';

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage(page);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function toggleSection(name) {
  const items = document.getElementById('section-' + name);
  const arrow = document.getElementById('arrow-' + name);
  if (items) items.classList.toggle('closed');
  if (arrow) arrow.classList.toggle('closed');
}

// ======================================
// UTILS
// ======================================
function fmt(centavos) {
  if (centavos === null || centavos === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);
}

function parseMoney(str) {
  const clean = str.replace(/[^\d,]/g, '').replace(',', '.');
  return Math.round(parseFloat(clean || '0') * 100);
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthYear() {
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

function monthName(m) {
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m-1];
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : '⚠️ ') + msg;
  t.className = 'toast ' + type;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function openModal(title, bodyHTML, wide = false) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  if (wide) document.getElementById('modalBox').style.maxWidth = '680px';
  else document.getElementById('modalBox').style.maxWidth = '520px';
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modalBody').innerHTML = '';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

// Variável global para guardar o callback de confirmação (evita problemas de closure)
let _pendingCb = null;

function _executePendingCb() {
  if (typeof _pendingCb === 'function') {
    DB = loadDB(); // Garante que o DB em memória está sincronizado com localStorage
    _pendingCb();
    _pendingCb = null;
  }
}

function confirm_action(msg, cb) {
  _pendingCb = cb;
  openModal('Confirmar Ação', `
    <p style="margin-bottom:20px;color:var(--text-secondary)">${msg}</p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-danger" onclick="closeModal();_executePendingCb()">Confirmar</button>
    </div>
  `);
}

function inputMoney(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '');
    if (!v) { this.value = ''; return; }
    v = parseInt(v);
    this.value = (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

function getMoneyValue(id) {
  const el = document.getElementById(id);
  if (!el || !el.value) return 0;
  const clean = el.value.replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(clean || '0') * 100);
}

// ======================================
// LIMITES FISCAIS (core logic)
// ======================================
function calcConsumoEntidade(entidadeId, mes, ano) {
  if (mes === globalFiltroMes && ano === globalFiltroAno) {
    return DB.recebimentos
      .filter(r => r.entidadeId === entidadeId && isPeriodoValido(r.mesRef, r.anoRef))
      .reduce((s, r) => s + r.valor, 0);
  }
  return DB.recebimentos
    .filter(r => r.entidadeId === entidadeId && r.mesRef === mes && r.anoRef === ano)
    .reduce((s, r) => s + r.valor, 0);
}

function calcConsumoAnual(entidadeId, ano) {
  return DB.recebimentos
    .filter(r => r.entidadeId === entidadeId && r.anoRef === ano)
    .reduce((s, r) => s + r.valor, 0);
}

function getLimiteStatus(pct) {
  if (pct >= 95) return 'danger';
  if (pct >= 80) return 'warn';
  return 'ok';
}

function buildGauge(label, used, total, type) {
  if (!total) return '';
  const pct = Math.min((used / total) * 100, 100);
  const status = getLimiteStatus(pct);
  const alertBadge = pct >= 95 ? '<span class="badge badge-red" style="font-size:10px">CRÍTICO</span>' :
                     pct >= 80 ? '<span class="badge badge-yellow" style="font-size:10px">ATENÇÃO</span>' : '';
  return `
    <div class="gauge-wrap">
      <div class="gauge-header">
        <span class="gauge-label">${label} ${alertBadge}</span>
        <span class="gauge-pct" style="color:var(--${status === 'ok' ? 'success' : status === 'warn' ? 'warning' : 'danger'})">${pct.toFixed(1)}%</span>
      </div>
      <div class="gauge-bar"><div class="gauge-fill ${status}" style="width:${pct}%"></div></div>
      <div class="gauge-sub">
        <span>${fmt(used)} usado</span>
        <span>${fmt(total - used)} restante</span>
      </div>
    </div>`;
}

// ======================================
// CAIXA ESPÉCIE
// ======================================
function getSaldoCaixa() {
  const entradas = DB.caixaMovimentos.filter(m => m.tipo === 'ENTRADA').reduce((s,m) => s+m.valor, 0);
  const saidas   = DB.caixaMovimentos.filter(m => m.tipo === 'SAIDA').reduce((s,m) => s+m.valor, 0);
  return entradas - saidas;
}

// ======================================
// BANCO SALDOS
// ======================================
function getBancoSaldo(bancoId) {
  const banco = DB.bancos.find(b => b.id === bancoId);
  if (!banco) return 0;
  const entradas = DB.recebimentos.filter(r => r.bancoId === bancoId).reduce((s,r) => s+r.valor, 0);
  const saidas   = DB.despesas.filter(d => d.bancoId === bancoId).reduce((s,d) => s+d.valor, 0);
  const pagBanco = DB.pagamentos.filter(p => p.bancoId === bancoId).reduce((s,p) => s+p.valorPago, 0);
  return banco.saldoInicial + entradas - saidas - pagBanco;
}

// ======================================
// PAGE RENDERER
// ======================================
function renderPage(page) {
  const el = document.getElementById('pageContent');
  switch (page) {
    case 'dashboard':       el.innerHTML = pageDashboard(); break;
    case 'obras':           el.innerHTML = pageObras(); break;
    case 'recebimentos':    el.innerHTML = pageRecebimentos(); break;
    case 'limites':         el.innerHTML = pageLimites(); break;
    case 'caixa':           el.innerHTML = pageCaixa(); break;
    case 'bancos':          el.innerHTML = pageBancos(); break;
    case 'funcionarios':    el.innerHTML = pageFuncionarios(); break;
    case 'ponto':
      el.innerHTML = pagePonto();
      renderPontoCalendar();
      break;
    case 'pagamentos':      el.innerHTML = pagePagamentos(); break;
    case 'despesas':        el.innerHTML = pageDespesas(); break;
    case 'checklist':       el.innerHTML = pageChecklist(); break;
    case 'agenda':          el.innerHTML = pageAgenda(); break;
    case 'configuracoes':   el.innerHTML = pageConfiguracoes(); break;
    case 'pessoal-dashboard': el.innerHTML = pagePessoalDashboard(); break;
    case 'pessoal-despesas': el.innerHTML = pagePessoalDespesas(); break;
    default: el.innerHTML = '<div class="page-body"><p>Página não encontrada.</p></div>';
  }
  // init charts after render
  setTimeout(initCharts, 100);
  // init money inputs
  document.querySelectorAll('.money-input').forEach(el => {
    el.addEventListener('input', function() {
      let v = this.value.replace(/\D/g, '');
      if (!v) { this.value = ''; return; }
      v = parseInt(v);
      this.value = (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  });
}

// ======================================
// DASHBOARD EMPRESARIAL
// ======================================
function pageDashboard() {
  const mes = globalFiltroMes;
  const ano = globalFiltroAno;

  const totalRecMes  = DB.recebimentos.filter(r => isPeriodoValido(r.mesRef, r.anoRef)).reduce((s,r) => s+r.valor, 0);
  const saldoCaixa   = getSaldoCaixa();
  const obrasAtivas  = DB.obras.filter(o => o.status === 'ATIVA').length;
  const funcAtivos   = DB.funcionarios.filter(f => f.ativo).length;

  // Limites cards
  let limitesHTML = DB.entidades.filter(e => e.tipo !== 'CAIXA').map(e => {
    if (e.tipo === 'MEI') {
      const consumidoAno = calcConsumoAnual(e.id, ano);
      const pct = Math.min((consumidoAno / e.limiteAnual) * 100, 100);
      const st = getLimiteStatus(pct);
      return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:13px;font-weight:600">MEI ${e.nome}</span>
          <span style="font-size:12px;color:var(--${st==='ok'?'success':st==='warn'?'warning':'danger'})">${pct.toFixed(1)}%</span>
        </div>
        <div class="gauge-bar"><div class="gauge-fill ${st}" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px">
          <span>${fmt(consumidoAno)}</span><span>${fmt(e.limiteAnual)}</span>
        </div>
      </div>`;
    } else {
      const consumidoMes = calcConsumoEntidade(e.id, mes, ano);
      const pct = Math.min((consumidoMes / e.limiteMensal) * 100, 100);
      const st = getLimiteStatus(pct);
      return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:13px;font-weight:600">PF ${e.nome}</span>
          <span style="font-size:12px;color:var(--${st==='ok'?'success':st==='warn'?'warning':'danger'})">${pct.toFixed(1)}%</span>
        </div>
        <div class="gauge-bar"><div class="gauge-fill ${st}" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px">
          <span>${fmt(consumidoMes)}</span><span>${fmt(e.limiteMensal)}</span>
        </div>
      </div>`;
    }
  }).join('');

  // Faturamento por obra (top 5)
  const obrasFat = DB.obras.map(o => ({
    nome: o.nome,
    fat: DB.recebimentos.filter(r => r.obraId === o.id && isPeriodoValido(r.mesRef, r.anoRef)).reduce((s,r) => s+r.valor, 0)
  })).sort((a,b) => b.fat - a.fat).slice(0,5);

  // Últimos recebimentos
  const ultReceb = [...DB.recebimentos].sort((a,b) => b.id - a.id).slice(0,5);

  return `
  <div class="page-header">
    <div class="page-title">
      <h2>📊 Dashboard Empresarial</h2>
      <p>${getPeriodoFormatado()} — Visão Geral Financeira</p>
    </div>
  </div>
  <div class="page-body">
    ${renderPeriodFilterCard('Visualizar Período')}

    <!-- STAT CARDS -->
    <div class="grid-4" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon orange">💰</div>
        <div class="stat-info">
          <div class="stat-label">Faturamento do Período</div>
          <div class="stat-value">${fmt(totalRecMes)}</div>
          <div class="stat-change">${getPeriodoFormatado()}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">💵</div>
        <div class="stat-info">
          <div class="stat-label">Caixa em Espécie</div>
          <div class="stat-value">${fmt(saldoCaixa)}</div>
          <div class="stat-change">Disponível</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">🏚️</div>
        <div class="stat-info">
          <div class="stat-label">Obras Ativas</div>
          <div class="stat-value">${obrasAtivas}</div>
          <div class="stat-change">${DB.obras.length} total</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon yellow">👷</div>
        <div class="stat-info">
          <div class="stat-label">Funcionários</div>
          <div class="stat-value">${funcAtivos}</div>
          <div class="stat-change">Ativos</div>
        </div>
      </div>
    </div>

    <!-- MIDDLE ROW -->
    <div class="grid-2" style="margin-bottom:24px">
      <!-- Limites Fiscais -->
      <div class="card">
        <div class="card-title">📈 Limites Fiscais — ${getPeriodoFormatado()}</div>
        ${limitesHTML || '<div class="empty-state"><div class="empty-icon">📊</div><p class="empty-title">Sem movimentações</p></div>'}
      </div>
      <!-- Faturamento por obra -->
      <div class="card">
        <div class="card-title">🏚️ Faturamento por Obra (${ano})</div>
        <div class="chart-container">
          <canvas id="chartObras"></canvas>
        </div>
        <div id="chartObrasData" style="display:none">${JSON.stringify(obrasFat)}</div>
      </div>
    </div>

    <!-- BOTTOM ROW -->
    <div class="grid-2">
      <!-- Distribuição por entidade -->
      <div class="card">
        <div class="card-title">🎯 Distribuição por Entidade (Mês)</div>
        <div class="chart-container">
          <canvas id="chartEntidades"></canvas>
        </div>
      </div>
      <!-- Últimos recebimentos -->
      <div class="card">
        <div class="card-title">💳 Últimos Recebimentos</div>
        ${ultReceb.length === 0 ? '<div class="empty-state"><div class="empty-icon">💰</div><p class="empty-title">Sem recebimentos</p></div>' :
        `<div class="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Obra</th><th>Entidade</th><th>Valor</th></tr></thead>
            <tbody>
              ${ultReceb.map(r => {
                const obra = DB.obras.find(o => o.id === r.obraId);
                const ent  = DB.entidades.find(e => e.id === r.entidadeId);
                return `<tr>
                  <td>${fmtDate(r.data)}</td>
                  <td>${obra ? obra.nome.slice(0,20) : '—'}</td>
                  <td><span class="badge ${ent?.tipo==='MEI'?'badge-orange':ent?.tipo==='PF'?'badge-blue':'badge-green'}">${ent?.tipo} ${ent?.nome}</span></td>
                  <td class="td-number">${fmt(r.valor)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    </div>
  </div>`;
}

// ======================================
// OBRAS
// ======================================
function pageObras() {
  const rows = DB.obras.map(o => {
    const fat = DB.recebimentos.filter(r => r.obraId === o.id).reduce((s,r) => s+r.valor, 0);
    const aReceber = (o.valorContrato || 0) - fat;
    const stBadge = o.status === 'ATIVA' ? 'badge-green' : o.status === 'CONCLUIDA' ? 'badge-blue' : 'badge-yellow';
    const aReceberColor = aReceber < 0 ? 'var(--danger)' : aReceber === 0 ? 'var(--text-muted)' : 'var(--warning)';
    const aReceberLabel = aReceber < 0
      ? `<span style="color:var(--danger);font-size:10px;font-weight:700">EXCEDIDO</span><br>${fmt(Math.abs(aReceber))}`
      : aReceber === 0 && (o.valorContrato || 0) > 0
        ? `<span style="color:var(--success);font-size:10px;font-weight:700">✅ QUITADO</span>`
        : fmt(aReceber);
    return `<tr>
      <td><strong>${o.codigo}</strong></td>
      <td>${o.nome}</td>
      <td>${o.cliente || '—'}</td>
      <td class="td-number">${fmt(o.valorContrato)}</td>
      <td class="td-number" style="color:var(--success)">${fmt(fat)}</td>
      <td class="td-number" style="color:${aReceberColor}">${aReceberLabel}</td>
      <td><span class="badge ${stBadge}">${o.status}</span></td>
      <td>${fmtDate(o.dataInicio)}</td>
      <td class="td-actions">
        <button class="btn-icon" onclick="editObra(${o.id})" title="Editar">✏️</button>
        <button class="btn-icon" onclick="deleteObra(${o.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>🏚️ Obras / Projetos</h2><p>Gestão de obras e projetos da construtora</p></div>
    <div class="page-actions">
      <button class="btn-primary" onclick="modalNovaObra()">➕ Nova Obra</button>
    </div>
  </div>
  <div class="page-body">
    ${DB.obras.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🏚️</div><p class="empty-title">Nenhuma obra cadastrada</p><p class="empty-subtitle">Clique em "Nova Obra" para começar</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Código</th><th>Nome</th><th>Cliente</th><th>Contrato</th><th>Faturado</th><th>A Receber</th><th>Status</th><th>Início</th><th>Ações</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

function modalNovaObra(id) {
  const o = id ? DB.obras.find(x => x.id === id) : null;
  const nxt = 'OB-' + new Date().getFullYear() + '-' + String(DB.obras.length + 1).padStart(3,'0');
  openModal(o ? 'Editar Obra' : 'Nova Obra', `
    <div class="form-group"><label>Código</label><input id="oCodigo" value="${o?.codigo || nxt}" /></div>
    <div class="form-group"><label>Nome da Obra *</label><input id="oNome" value="${o?.nome || ''}" /></div>
    <div class="form-group"><label>Cliente</label><input id="oCliente" value="${o?.cliente || ''}" /></div>
    <div class="form-group"><label>Endereço</label><input id="oEndereco" value="${o?.endereco || ''}" /></div>
    <div class="form-row">
      <div class="form-group"><label>Valor do Contrato (R$)</label><input id="oContrato" class="money-input" value="${o?.valorContrato ? (o.valorContrato/100).toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''}" placeholder="0,00" /></div>
      <div class="form-group"><label>Status</label>
        <select id="oStatus">
          ${['ATIVA','CONCLUIDA','SUSPENSA'].map(s => `<option ${o?.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Data Início</label><input type="date" id="oInicio" value="${o?.dataInicio || ''}" /></div>
      <div class="form-group"><label>Previsão Conclusão</label><input type="date" id="oPrevista" value="${o?.dataPrevista || ''}" /></div>
    </div>
    <div class="form-group"><label>Observações</label><textarea id="oObs">${o?.observacoes || ''}</textarea></div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarObra(${id || 'null'})">💾 Salvar</button>
    </div>
  `, true);
}

function editObra(id) { modalNovaObra(id); }

function salvarObra(id) {
  const nome = document.getElementById('oNome').value.trim();
  if (!nome) { showToast('Nome da obra é obrigatório', 'error'); return; }
  const obj = {
    codigo: document.getElementById('oCodigo').value.trim(),
    nome, cliente: document.getElementById('oCliente').value.trim(),
    endereco: document.getElementById('oEndereco').value.trim(),
    valorContrato: getMoneyValue('oContrato'),
    status: document.getElementById('oStatus').value,
    dataInicio: document.getElementById('oInicio').value,
    dataPrevista: document.getElementById('oPrevista').value,
    observacoes: document.getElementById('oObs').value,
  };
  if (id) { Object.assign(DB.obras.find(o => o.id === id), obj); }
  else { DB.obras.push({ id: nextId('obras'), ...obj }); }
  saveDB(DB);
  closeModal();
  showToast('Obra salva com sucesso!');
  navigate('obras');
}

function deleteObra(id) {
  confirm_action('Excluir esta obra? Os recebimentos vinculados serão mantidos.', () => {
    DB.obras = DB.obras.filter(o => o.id !== id);
    saveDB(DB);
    showToast('Obra excluída.', 'warning');
    navigate('obras');
  });
}

// ======================================
function pageRecebimentos() {
  const filtered = DB.recebimentos.filter(r => isPeriodoValido(r.mesRef, r.anoRef));

  const rows = [...filtered].sort((a,b) => b.id - a.id).map(r => {
    const obra = DB.obras.find(o => o.id === r.obraId);
    const ent  = DB.entidades.find(e => e.id === r.entidadeId);
    const banco = DB.bancos.find(b => b.id === r.bancoId);
    return `<tr>
      <td>${fmtDate(r.data)}</td>
      <td>${obra?.nome || '—'}</td>
      <td><span class="badge ${ent?.tipo==='MEI'?'badge-orange':ent?.tipo==='PF'?'badge-blue':'badge-green'}">${ent?.tipo} ${ent?.nome}</span></td>
      <td>${banco?.nomeBanco || (ent?.tipo==='CAIXA' ? '💵 Espécie' : '—')}</td>
      <td class="td-number" style="color:var(--success)">${fmt(r.valor)}</td>
      <td><span class="badge ${r.origem==='DEPOSITO_ESPECIE'?'badge-yellow':'badge-gray'}">${r.origem==='DEPOSITO_ESPECIE'?'Depósito Espécie':'Direto'}</span></td>
      <td>${r.descricao || '—'}</td>
      <td class="td-actions"><button class="btn-icon" onclick="deleteRecebimento(${r.id})" title="Excluir">🗑️</button></td>
    </tr>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>💰 Recebimentos</h2><p>Registro de entradas financeiras por obra e entidade</p></div>
    <div class="page-actions">
      <button class="btn-primary" onclick="modalNovoRecebimento()">➕ Novo Recebimento</button>
    </div>
  </div>
  <div class="page-body">
    ${renderPeriodFilterCard('Visualizar Período')}

    ${filtered.length === 0
      ? `<div class="empty-state"><div class="empty-icon">💰</div><p class="empty-title">Nenhum recebimento registrado para este período</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Data</th><th>Obra</th><th>Entidade</th><th>Banco</th><th>Valor</th><th>Origem</th><th>Descrição</th><th>Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

function modalNovoRecebimento() {
  const obrasOpts = DB.obras.filter(o => o.status === 'ATIVA').map(o => `<option value="${o.id}">${o.nome}</option>`).join('');
  if (!obrasOpts) { showToast('Cadastre uma obra primeiro.', 'warning'); return; }

  openModal('Novo Recebimento', `
    <div class="form-group"><label>Obra *</label><select id="rObra">${obrasOpts}</select></div>
    <div class="form-group"><label>Valor Recebido (R$) *</label>
      <div class="input-prefix"><span>R$</span><input id="rValor" class="money-input" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="form-group"><label>Data do Recebimento</label><input type="date" id="rData" value="${todayStr()}" /></div>
    <div class="form-group"><label>Destino *</label>
      <div class="entidade-pills" id="entidadePills">
        ${DB.entidades.map(e => `
          <div class="entidade-pill ${e.tipo.toLowerCase()}" data-id="${e.id}" data-tipo="${e.tipo}" onclick="selectEntidadePill(this)">
            ${e.tipo === 'CAIXA' ? '💵' : e.tipo === 'MEI' ? '🏢' : '👤'} ${e.tipo} ${e.nome}
          </div>`).join('')}
      </div>
      <input type="hidden" id="rEntidade" />
    </div>
    <div id="rBancoWrap" class="form-group hidden">
      <label>Banco de Destino</label>
      <select id="rBanco"></select>
    </div>
    <div class="form-group"><label>Descrição / Referência</label><input id="rDesc" placeholder="Ex: Medição 3, Sinal obra..." /></div>
    <div id="rLimiteInfo" class="info-box hidden" style="margin-top:12px"></div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarRecebimento()">💾 Registrar</button>
    </div>
  `, true);
}

function selectEntidadePill(el) {
  document.querySelectorAll('.entidade-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  const id = parseInt(el.dataset.id);
  const tipo = el.dataset.tipo;
  document.getElementById('rEntidade').value = id;
  const bancoWrap = document.getElementById('rBancoWrap');
  if (tipo !== 'CAIXA') {
    const bancosEnt = DB.bancos.filter(b => b.entidadeId === id);
    document.getElementById('rBanco').innerHTML = bancosEnt.length
      ? bancosEnt.map(b => `<option value="${b.id}">${b.nomeBanco}</option>`).join('')
      : '<option value="">Sem banco cadastrado</option>';
    bancoWrap.classList.remove('hidden');
    // show limite info
    const ent = DB.entidades.find(e => e.id === id);
    const { mes, ano } = currentMonthYear();
    let info = '';
    if (ent.tipo === 'MEI') {
      const usado = calcConsumoAnual(id, ano);
      const restante = ent.limiteAnual - usado;
      const pct = Math.min((usado / ent.limiteAnual) * 100, 100);
      info = `<strong>MEI ${ent.nome}</strong> — Limite anual: ${fmt(ent.limiteAnual)}<br>
              Usado: ${fmt(usado)} (${pct.toFixed(1)}%) — Restante: <strong style="color:${restante>0?'var(--success)':'var(--danger)'}">${fmt(Math.max(restante,0))}</strong>`;
    } else {
      const usado = calcConsumoEntidade(id, mes, ano);
      const restante = ent.limiteMensal - usado;
      const pct = Math.min((usado / ent.limiteMensal) * 100, 100);
      info = `<strong>PF ${ent.nome}</strong> — Limite mensal: ${fmt(ent.limiteMensal)}<br>
              Usado: ${fmt(usado)} (${pct.toFixed(1)}%) — Restante: <strong style="color:${restante>0?'var(--success)':'var(--danger)'}">${fmt(Math.max(restante,0))}</strong>`;
    }
    const infoEl = document.getElementById('rLimiteInfo');
    infoEl.innerHTML = '📊 ' + info;
    infoEl.classList.remove('hidden');
  } else {
    bancoWrap.classList.add('hidden');
    document.getElementById('rLimiteInfo').classList.add('hidden');
  }
}

function salvarRecebimento() {
  const obraId = parseInt(document.getElementById('rObra').value);
  const entId  = parseInt(document.getElementById('rEntidade').value);
  const valor  = getMoneyValue('rValor');
  const data   = document.getElementById('rData').value;

  if (!entId) { showToast('Selecione o destino', 'error'); return; }
  if (!valor) { showToast('Informe o valor', 'error'); return; }
  if (!data)  { showToast('Informe a data', 'error'); return; }

  const ent = DB.entidades.find(e => e.id === entId);
  const { mes, ano } = currentMonthYear();
  const [y, m] = data.split('-').map(Number);

  // Check limite
  if (ent.tipo === 'MEI') {
    const usado = calcConsumoAnual(entId, y);
    if (usado + valor > ent.limiteAnual) {
      const restante = ent.limiteAnual - usado;
      if (!confirm(`⚠️ ATENÇÃO: Este recebimento de ${fmt(valor)} ultrapassará o limite anual do MEI ${ent.nome}.\nRestante: ${fmt(Math.max(restante,0))}.\n\nDeseja continuar mesmo assim?`)) return;
    }
  } else if (ent.tipo === 'PF') {
    const usado = calcConsumoEntidade(entId, m, y);
    if (usado + valor > ent.limiteMensal) {
      const restante = ent.limiteMensal - usado;
      if (!confirm(`⚠️ ATENÇÃO: Este recebimento ultrapassará o limite mensal da PF ${ent.nome}.\nRestante: ${fmt(Math.max(restante,0))}.\n\nDeseja continuar mesmo assim?`)) return;
    }
  }

  let bancoId = null;
  if (ent.tipo !== 'CAIXA') {
    bancoId = parseInt(document.getElementById('rBanco').value) || null;
  }

  if (ent.tipo === 'CAIXA') {
    // Entrada no caixa
    DB.caixaMovimentos.push({
      id: nextId('caixaMovimentos'),
      tipo: 'ENTRADA', valor, obraId,
      descricao: document.getElementById('rDesc').value,
      data, criado: new Date().toISOString()
    });
  }

  DB.recebimentos.push({
    id: nextId('recebimentos'),
    obraId, entidadeId: entId, bancoId, valor,
    data, origem: 'DIRETO',
    descricao: document.getElementById('rDesc').value,
    mesRef: m, anoRef: y,
    criado: new Date().toISOString()
  });

  saveDB(DB);
  closeModal();
  showToast('Recebimento registrado!');
  navigate('recebimentos');
}

function deleteRecebimento(id) {
  const r = DB.recebimentos.find(x => x.id === id);
  if (!r) return;

  confirm_action('Excluir este recebimento? Isso afetará os limites fiscais calculados.', () => {
    // Se for entrada no Caixa Geral / Caixa em Espécie
    const ent = DB.entidades.find(e => e.id === r.entidadeId);
    if (ent && ent.tipo === 'CAIXA') {
      DB.caixaMovimentos = DB.caixaMovimentos.filter(m => 
        !(m.tipo === 'ENTRADA' && m.valor === r.valor && m.data === r.data && m.obraId === r.obraId && m.descricao === r.descricao)
      );
    }
    // Se for depósito do Caixa em Espécie
    if (r.origem === 'DEPOSITO_ESPECIE') {
      DB.caixaMovimentos = DB.caixaMovimentos.filter(m => 
        !(m.tipo === 'SAIDA' && m.valor === r.valor && m.data === r.data && m.entidadeDestino === r.entidadeId && m.bancoDestino === r.bancoId)
      );
    }

    DB.recebimentos = DB.recebimentos.filter(x => x.id !== id);
    saveDB(DB);
    showToast('Recebimento excluído.', 'warning');
    navigate('recebimentos');
  });
}

// ======================================
// LIMITES FISCAIS
// ======================================
function pageLimites() {
  const now = new Date();
  if (!globalFiltroMes) globalFiltroMes = now.getMonth() + 1;
  if (!globalFiltroAno) globalFiltroAno = now.getFullYear();

  const mes = globalFiltroMes;
  const ano = globalFiltroAno;

  const meis = DB.entidades.filter(e => e.tipo === 'MEI');
  const pfs  = DB.entidades.filter(e => e.tipo === 'PF');

  const meiCards = meis.map(e => {
    const consumidoAno = calcConsumoAnual(e.id, ano);
    const pctAno = Math.min((consumidoAno / e.limiteAnual) * 100, 100);
    const mediaIdeal = e.limiteAnual / 12;
    const consumidoMes = calcConsumoEntidade(e.id, mes, ano);
    const pctMes = Math.min((consumidoMes / mediaIdeal) * 100, 100);
    const alertas = [];
    if (pctAno >= 95) alertas.push(`<div class="alert alert-danger">🚨 Limite anual CRÍTICO! Apenas ${fmt(e.limiteAnual - consumidoAno)} restante.</div>`);
    else if (pctAno >= 80) alertas.push(`<div class="alert alert-warning">⚠️ Atenção: Já consumiu ${pctAno.toFixed(1)}% do limite anual.</div>`);
    return `<div class="card">
      <div class="card-title">🏢 MEI — ${e.nome} <span class="badge badge-orange" style="font-size:10px">${e.cnpj}</span></div>
      ${alertas.join('')}
      ${buildGauge('Limite Anual (R$ 81.000)', consumidoAno, e.limiteAnual, 'anual')}
      ${buildGauge('Média Mensal Sugerida (R$ 6.750)', consumidoMes, mediaIdeal, 'mensal')}
      <div class="summary-row"><span class="label">Total recebido ${ano}</span><span class="value">${fmt(consumidoAno)}</span></div>
      <div class="summary-row"><span class="label">Restante no ano</span><span class="value" style="color:var(--success)">${fmt(Math.max(e.limiteAnual - consumidoAno, 0))}</span></div>
      <div class="summary-row"><span class="label">Recebido em ${monthName(mes)}</span><span class="value">${fmt(consumidoMes)}</span></div>
    </div>`;
  }).join('');

  const pfCards = pfs.map(e => {
    const consumidoMes = calcConsumoEntidade(e.id, mes, ano);
    const pct = Math.min((consumidoMes / e.limiteMensal) * 100, 100);
    const alertas = [];
    if (pct >= 100) alertas.push(`<div class="alert alert-danger">🚨 Limite mensal ULTRAPASSADO!</div>`);
    else if (pct >= 80) alertas.push(`<div class="alert alert-warning">⚠️ Atenção: Já consumiu ${pct.toFixed(1)}% do limite mensal.</div>`);
    return `<div class="card">
      <div class="card-title">👤 PF — ${e.nome}</div>
      ${alertas.join('')}
      ${buildGauge(`Limite Mensal — ${monthName(mes)}/${ano} (R$ 5.000)`, consumidoMes, e.limiteMensal, 'mensal')}
      <div class="summary-row"><span class="label">Recebido este mês</span><span class="value">${fmt(consumidoMes)}</span></div>
      <div class="summary-row"><span class="label">Restante</span><span class="value" style="color:${consumidoMes < e.limiteMensal ? 'var(--success)' : 'var(--danger)'}">${fmt(Math.max(e.limiteMensal - consumidoMes, 0))}</span></div>
    </div>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>📈 Limites Fiscais</h2><p>Controle de tetos fiscais — MEI e Pessoa Física</p></div>
  </div>
  <div class="page-body">
    ${renderPeriodFilterCard('Visualizar Período')}
    <div class="alert alert-info">ℹ️ <strong>Regras:</strong> MEI tem teto anual de R$ 81.000,00 (média sugerida R$ 6.750/mês). PF tem limite de isenção de IRPF de R$ 5.000,00/mês. Alertas em 80% (⚠️) e 95% (🚨).</div>
    <div style="margin-bottom:12px"><strong>MEIs</strong></div>
    <div class="grid-3" style="margin-bottom:24px">${meiCards}</div>
    <div style="margin-bottom:12px"><strong>Pessoas Físicas</strong></div>
    <div class="grid-3">${pfCards}</div>
  </div>`;
}

// ======================================
// CAIXA EM ESPÉCIE
// ======================================
function pageCaixa() {
  const filtered = DB.caixaMovimentos.filter(m => isDataValida(m.data));

  const saldo = getSaldoCaixa();
  const movs  = [...filtered].sort((a,b) => b.id - a.id);
  const rows  = movs.map(m => {
    const obra = DB.obras.find(o => o.id === m.obraId);
    const ent  = m.entidadeDestino ? DB.entidades.find(e => e.id === m.entidadeDestino) : null;
    const banco = m.bancoDestino ? DB.bancos.find(b => b.id === m.bancoDestino) : null;
    return `<tr>
      <td>${fmtDate(m.data)}</td>
      <td><span class="badge ${m.tipo==='ENTRADA'?'badge-green':'badge-red'}">${m.tipo}</span></td>
      <td>${m.tipo==='ENTRADA' ? (obra?.nome || '—') : (banco ? `${banco.nomeBanco} / ${ent?.nome||''}` : '—')}</td>
      <td class="td-number" style="color:${m.tipo==='ENTRADA'?'var(--success)':'var(--danger)'}">
        ${m.tipo==='ENTRADA'?'+':'−'} ${fmt(m.valor)}
      </td>
      <td>${m.descricao || '—'}</td>
      <td class="td-actions">
        <button class="btn-icon" onclick="deleteCaixaMovimento(${m.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>💵 Caixa em Espécie</h2><p>Controle de dinheiro físico — recebimentos e depósitos</p></div>
    <div class="page-actions">
      <button class="btn-primary" onclick="modalDepositoEspecie()">🏦 Depositar em Banco</button>
    </div>
  </div>
  <div class="page-body">
    <div class="caixa-card" style="margin-bottom:24px">
      <div class="caixa-label">💵 SALDO EM CAIXA (ESPÉCIE)</div>
      <div class="caixa-amount">${fmt(saldo)}</div>
      <div class="caixa-label">Dinheiro físico disponível</div>
    </div>
    <div class="alert alert-info">ℹ️ O caixa em espécie NÃO afeta os limites fiscais enquanto estiver aqui. Use "Depositar em Banco" para transferir para uma conta e abater o limite da entidade escolhida.</div>
    
    ${renderPeriodFilterCard('Visualizar Período')}

    <div class="card">
      <div class="card-title">📋 Histórico de Movimentações</div>
      ${movs.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💵</div><p class="empty-title">Nenhuma movimentação registrada para este período</p></div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Referência</th><th>Valor</th><th>Descrição</th><th>Ação</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
      }
    </div>
  </div>`;
}

function modalDepositoEspecie() {
  const saldo = getSaldoCaixa();
  if (saldo <= 0) { showToast('Saldo do caixa é zero', 'warning'); return; }

  const entOpts = DB.entidades.filter(e => e.tipo !== 'CAIXA').map(e => `<option value="${e.id}">${e.tipo} — ${e.nome}</option>`).join('');

  openModal('Depositar Espécie em Banco', `
    <div class="info-box" style="margin-bottom:16px">💵 <strong>Saldo disponível em espécie: ${fmt(saldo)}</strong></div>
    <div class="form-group"><label>Valor a Depositar (R$) *</label>
      <div class="input-prefix"><span>R$</span><input id="depValor" class="money-input" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="form-group"><label>Entidade Destino *</label>
      <select id="depEntidade" onchange="onDepositoEntChange()">${entOpts}</select>
    </div>
    <div class="form-group"><label>Banco Destino *</label>
      <select id="depBanco"></select>
    </div>
    <div class="form-group"><label>Data do Depósito</label><input type="date" id="depData" value="${todayStr()}" /></div>
    <div id="depLimiteInfo" class="info-box" style="margin-top:10px"></div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="executarDepositoEspecie()">✅ Confirmar Depósito</button>
    </div>
  `);
  setTimeout(onDepositoEntChange, 100);
}

function onDepositoEntChange() {
  const entId = parseInt(document.getElementById('depEntidade').value);
  const ent = DB.entidades.find(e => e.id === entId);
  const bancosEnt = DB.bancos.filter(b => b.entidadeId === entId);
  document.getElementById('depBanco').innerHTML = bancosEnt.length
    ? bancosEnt.map(b => `<option value="${b.id}">${b.nomeBanco}</option>`).join('')
    : '<option value="">Sem banco cadastrado para esta entidade</option>';

  const { mes, ano } = currentMonthYear();
  let info = '';
  if (ent.tipo === 'MEI') {
    const usado = calcConsumoAnual(entId, ano);
    info = `MEI ${ent.nome} — Usado no ano: ${fmt(usado)} / ${fmt(ent.limiteAnual)} (${((usado/ent.limiteAnual)*100).toFixed(1)}%)`;
  } else {
    const usado = calcConsumoEntidade(entId, mes, ano);
    info = `PF ${ent.nome} — Usado no mês: ${fmt(usado)} / ${fmt(ent.limiteMensal)} (${((usado/ent.limiteMensal)*100).toFixed(1)}%)`;
  }
  document.getElementById('depLimiteInfo').textContent = '📊 ' + info;
}

function executarDepositoEspecie() {
  const saldo  = getSaldoCaixa();
  const valor  = getMoneyValue('depValor');
  const entId  = parseInt(document.getElementById('depEntidade').value);
  const bancoId = parseInt(document.getElementById('depBanco').value);
  const data   = document.getElementById('depData').value;
  const [y, m] = data.split('-').map(Number);

  if (!valor) { showToast('Informe o valor', 'error'); return; }
  if (valor > saldo) { showToast(`Valor maior que o saldo (${fmt(saldo)})`, 'error'); return; }
  if (!bancoId) { showToast('Selecione um banco', 'error'); return; }

  const ent = DB.entidades.find(e => e.id === entId);

  // Criar saída no caixa
  DB.caixaMovimentos.push({
    id: nextId('caixaMovimentos'),
    tipo: 'SAIDA', valor,
    entidadeDestino: entId, bancoDestino: bancoId,
    descricao: `Depósito em banco — ${ent.nome}`,
    data, criado: new Date().toISOString()
  });

  // Criar recebimento vinculado
  DB.recebimentos.push({
    id: nextId('recebimentos'),
    obraId: null, entidadeId: entId, bancoId, valor,
    data, origem: 'DEPOSITO_ESPECIE',
    descricao: `Depósito de espécie — ${ent.nome}`,
    mesRef: m, anoRef: y,
    criado: new Date().toISOString()
  });

  saveDB(DB);
  closeModal();
  showToast(`${fmt(valor)} depositados com sucesso!`);
  navigate('caixa');
}

function deleteCaixaMovimento(id) {
  const m = DB.caixaMovimentos.find(x => x.id === id);
  if (!m) return;

  confirm_action('Excluir esta movimentação do caixa? O recebimento correspondente também será excluído.', () => {
    if (m.tipo === 'ENTRADA') {
      // Excluir recebimento correspondente
      DB.recebimentos = DB.recebimentos.filter(r => {
        const ent = DB.entidades.find(e => e.id === r.entidadeId);
        const isCaixa = ent && ent.tipo === 'CAIXA';
        return !(isCaixa && r.valor === m.valor && r.data === m.data && r.obraId === m.obraId && r.descricao === m.descricao);
      });
    } else if (m.tipo === 'SAIDA') {
      // Excluir recebimento correspondente (depósito)
      DB.recebimentos = DB.recebimentos.filter(r => 
        !(r.origem === 'DEPOSITO_ESPECIE' && r.valor === m.valor && r.data === m.data && r.entidadeId === m.entidadeDestino && r.bancoId === m.bancoDestino)
      );
    }

    DB.caixaMovimentos = DB.caixaMovimentos.filter(x => x.id !== id);
    saveDB(DB);
    showToast('Movimentação do caixa excluída.', 'warning');
    navigate('caixa');
  });
}

// ======================================
// BANCOS
// ======================================
function pageBancos() {
  const rows = DB.bancos.map(b => {
    const ent   = DB.entidades.find(e => e.id === b.entidadeId);
    const saldo = getBancoSaldo(b.id);
    return `<tr>
      <td><strong>${b.nomeBanco}</strong></td>
      <td>${b.agencia || '—'}</td>
      <td>${b.conta || '—'}</td>
      <td><span class="badge ${ent?.tipo==='MEI'?'badge-orange':'badge-blue'}">${ent?.tipo} ${ent?.nome}</span></td>
      <td class="td-number">${fmt(b.saldoInicial)}</td>
      <td class="td-number" style="color:${saldo>=0?'var(--success)':'var(--danger)'}"><strong>${fmt(saldo)}</strong></td>
      <td class="td-actions">
        <button class="btn-icon" onclick="editBanco(${b.id})" title="Editar">✏️</button>
        <button class="btn-icon" onclick="deleteBanco(${b.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>🏦 Bancos</h2><p>Contas bancárias vinculadas às entidades</p></div>
    <div class="page-actions">
      <button class="btn-primary" onclick="modalNovoBanco()">➕ Novo Banco</button>
    </div>
  </div>
  <div class="page-body">
    ${DB.bancos.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🏦</div><p class="empty-title">Nenhum banco cadastrado</p><p class="empty-subtitle">Clique em "Novo Banco" para adicionar uma conta bancária</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Banco</th><th>Agência</th><th>Conta</th><th>Entidade</th><th>Saldo Inicial</th><th>Saldo Atual</th><th>Ações</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

function modalNovoBanco(id) {
  const b = id ? DB.bancos.find(x => x.id === id) : null;
  const entOpts = DB.entidades.filter(e => e.tipo !== 'CAIXA').map(e => `<option value="${e.id}" ${b?.entidadeId===e.id?'selected':''}>${e.tipo} — ${e.nome}</option>`).join('');

  openModal(b ? 'Editar Banco' : 'Novo Banco', `
    <div class="form-group"><label>Entidade Vinculada *</label><select id="bEntidade">${entOpts}</select></div>
    <div class="form-group"><label>Nome do Banco *</label><input id="bNome" value="${b?.nomeBanco||''}" placeholder="Ex: Nubank, Inter, Caixa Econômica..." /></div>
    <div class="form-row">
      <div class="form-group"><label>Agência</label><input id="bAgencia" value="${b?.agencia||''}" /></div>
      <div class="form-group"><label>Conta</label><input id="bConta" value="${b?.conta||''}" /></div>
    </div>
    <div class="form-group"><label>Saldo Inicial (R$)</label>
      <div class="input-prefix"><span>R$</span><input id="bSaldo" class="money-input" value="${b?.saldoInicial ? (b.saldoInicial/100).toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''}" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarBanco(${id||'null'})">💾 Salvar</button>
    </div>
  `);
}

function editBanco(id) { modalNovoBanco(id); }

function salvarBanco(id) {
  const nome = document.getElementById('bNome').value.trim();
  if (!nome) { showToast('Nome do banco é obrigatório', 'error'); return; }
  const obj = {
    entidadeId: parseInt(document.getElementById('bEntidade').value),
    nomeBanco: nome,
    agencia: document.getElementById('bAgencia').value.trim(),
    conta: document.getElementById('bConta').value.trim(),
    saldoInicial: getMoneyValue('bSaldo'),
    ativo: true
  };
  if (id) { Object.assign(DB.bancos.find(b => b.id === id), obj); }
  else { DB.bancos.push({ id: nextId('bancos'), ...obj }); }
  saveDB(DB);
  closeModal();
  showToast('Banco salvo!');
  navigate('bancos');
}

function deleteBanco(id) {
  confirm_action('Excluir este banco?', () => {
    DB.bancos = DB.bancos.filter(b => b.id !== id);
    saveDB(DB);
    showToast('Banco excluído.', 'warning');
    navigate('bancos');
  });
}

// ======================================
// FUNCIONÁRIOS
// ======================================
function pageFuncionarios() {
  const rows = DB.funcionarios.map(f => `<tr>
    <td><strong>${f.nome}</strong></td>
    <td>${f.cpf || '—'}</td>
    <td>${f.telefone || '—'}</td>
    <td><span class="badge ${f.tipo==='DIARISTA'?'badge-blue':'badge-orange'}">${f.tipo}</span></td>
    <td class="td-number">${f.tipo==='DIARISTA' ? fmt(f.valorDiaria) : '—'}</td>
    <td><span class="badge ${f.ativo?'badge-green':'badge-gray'}">${f.ativo?'Ativo':'Inativo'}</span></td>
    <td class="td-actions">
      <button class="btn-icon" onclick="editFuncionario(${f.id})" title="Editar">✏️</button>
      <button class="btn-icon" onclick="deleteFuncionario(${f.id})" title="Excluir">🗑️</button>
    </td>
  </tr>`).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>👷 Funcionários</h2><p>Cadastro de colaboradores da construtora</p></div>
    <div class="page-actions">
      <button class="btn-primary" onclick="modalNovoFuncionario()">➕ Novo Funcionário</button>
    </div>
  </div>
  <div class="page-body">
    ${DB.funcionarios.length === 0
      ? `<div class="empty-state"><div class="empty-icon">👷</div><p class="empty-title">Nenhum funcionário cadastrado</p><p class="empty-subtitle">Clique em "Novo Funcionário" para cadastrar</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Tipo</th><th>Valor Diária</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

function modalNovoFuncionario(id) {
  const f = id ? DB.funcionarios.find(x => x.id === id) : null;
  openModal(f ? 'Editar Funcionário' : 'Novo Funcionário', `
    <div class="form-group"><label>Nome Completo *</label><input id="fNome" value="${f?.nome||''}" /></div>
    <div class="form-row">
      <div class="form-group"><label>CPF</label><input id="fCpf" value="${f?.cpf||''}" placeholder="000.000.000-00" /></div>
      <div class="form-group"><label>Telefone</label><input id="fTel" value="${f?.telefone||''}" placeholder="(00) 00000-0000" /></div>
    </div>
    <div class="form-group"><label>Tipo de Contratação *</label>
      <select id="fTipo" onchange="onFuncTipoChange()">
        <option ${f?.tipo==='DIARISTA'?'selected':''}>DIARISTA</option>
        <option ${f?.tipo==='EMPREITEIRO'?'selected':''}>EMPREITEIRO</option>
      </select>
    </div>
    <div id="fDiariaWrap" class="form-group">
      <label>Valor da Diária (R$)</label>
      <div class="input-prefix"><span>R$</span><input id="fDiaria" class="money-input" value="${f?.valorDiaria ? (f.valorDiaria/100).toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''}" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarFuncionario(${id||'null'})">💾 Salvar</button>
    </div>
  `);
  setTimeout(onFuncTipoChange, 50);
}

function onFuncTipoChange() {
  const tipo = document.getElementById('fTipo')?.value;
  const wrap = document.getElementById('fDiariaWrap');
  if (wrap) wrap.style.display = tipo === 'DIARISTA' ? 'block' : 'none';
}

function editFuncionario(id) { modalNovoFuncionario(id); }

function salvarFuncionario(id) {
  const nome = document.getElementById('fNome').value.trim();
  if (!nome) { showToast('Nome é obrigatório', 'error'); return; }
  const obj = {
    nome,
    cpf: document.getElementById('fCpf').value.trim(),
    telefone: document.getElementById('fTel').value.trim(),
    tipo: document.getElementById('fTipo').value,
    valorDiaria: getMoneyValue('fDiaria'),
    ativo: true
  };
  if (id) { Object.assign(DB.funcionarios.find(f => f.id === id), obj); }
  else { DB.funcionarios.push({ id: nextId('funcionarios'), ...obj }); }
  saveDB(DB);
  closeModal();
  showToast('Funcionário salvo!');
  navigate('funcionarios');
}

function deleteFuncionario(id) {
  confirm_action('Excluir este funcionário?', () => {
    DB.funcionarios = DB.funcionarios.filter(f => f.id !== id);
    saveDB(DB);
    showToast('Funcionário excluído.', 'warning');
    navigate('funcionarios');
  });
}

// ======================================
// PONTO (CARTÃO DE PONTO)
// ======================================
let pontoSemanaId = null;
let pontoFuncId   = null;

function pagePonto() {
  const diaristas = DB.funcionarios.filter(f => f.tipo === 'DIARISTA' && f.ativo);
  
  let semanas = [];
  if (globalFiltroTipo === 'INTERVALO' || globalFiltroMes === 'all' || globalFiltroAno === 'all') {
    semanas = DB.semanaPagamento.filter(s => isPeriodoValido(s.mes, s.ano));
    if (semanas.length === 0) {
      const fallbackMes = (globalFiltroMes && globalFiltroMes !== 'all') ? globalFiltroMes : (new Date().getMonth() + 1);
      const fallbackAno = (globalFiltroAno && globalFiltroAno !== 'all') ? globalFiltroAno : new Date().getFullYear();
      semanas = getSemanasMes(fallbackMes, fallbackAno);
    }
  } else {
    semanas = getSemanasMes(globalFiltroMes, globalFiltroAno);
  }

  return `
  <div class="page-header">
    <div class="page-title"><h2>📅 Cartão de Ponto</h2><p>Registro de dias trabalhados por diaristas</p></div>
  </div>
  <div class="page-body">
    ${diaristas.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📅</div><p class="empty-title">Nenhum diarista cadastrado</p><p class="empty-subtitle">Cadastre funcionários do tipo DIARISTA primeiro</p></div>`
      : `
      ${renderPeriodFilterCard('Período de Referência')}

      <div class="grid-2">
        <div class="form-group"><label>Funcionário (Diarista)</label>
          <select id="pontoFunc" onchange="renderPontoCalendar()">
            ${diaristas.map(f => `<option value="${f.id}">${f.nome} — ${fmt(f.valorDiaria)}/dia</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Semana de Referência</label>
          <div style="display: flex; gap: 8px;">
            <select id="pontoSemana" onchange="renderPontoCalendar()" style="flex: 1; margin-bottom: 0;">
              ${semanas.map(s => `<option value="${s.id}">Semana ${s.numero} — ${fmtDate(s.dataInicio)} a ${fmtDate(s.dataFim)}</option>`).join('')}
            </select>
            <button class="btn-secondary" onclick="modalEditarSemana()" title="Editar período da semana" style="padding: 0 12px; height: 42px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">✏️</button>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>Obra</label>
        <select id="pontoObra">
          <option value="">— Selecionar Obra —</option>
          ${DB.obras.filter(o=>o.status==='ATIVA').map(o => `<option value="${o.id}">${o.nome}</option>`).join('')}
        </select>
      </div>
      <div id="pontoCalendarWrap" class="card">
        <div class="card-title">📅 Dias Trabalhados</div>
        <div id="pontoCalendar"></div>
        <div id="pontoResumo" style="margin-top:16px"></div>
      </div>`
    }
  </div>`;
}

function getSemanasMes(mes, ano) {
  const now = new Date();
  const targetAno = ano || now.getFullYear();
  const targetMes = mes || (now.getMonth() + 1);
  // Generate 4 weeks for selected month/year
  const semanas = [];
  for (let i = 1; i <= 4; i++) {
    const existing = DB.semanaPagamento.find(s => s.ano === targetAno && s.mes === targetMes && s.numero === i);
    if (existing) { semanas.push(existing); continue; }
    // Create week
    // Set hours to 12 to prevent any timezone shifts when converting to ISO string
    const d1 = new Date(targetAno, targetMes-1, (i-1)*7 + 1, 12, 0, 0);
    const d2 = new Date(targetAno, targetMes-1, Math.min(i*7, new Date(targetAno, targetMes, 0).getDate()), 12, 0, 0);
    const sem = {
      id: nextId('semanaPagamento'),
      ano: targetAno, mes: targetMes, numero: i,
      dataInicio: d1.toISOString().slice(0,10),
      dataFim:    d2.toISOString().slice(0,10),
      status: 'ABERTA'
    };
    DB.semanaPagamento.push(sem);
    saveDB(DB);
    semanas.push(sem);
  }
  return semanas;
}

function renderPontoCalendar() {
  const funcId  = parseInt(document.getElementById('pontoFunc')?.value);
  const semId   = parseInt(document.getElementById('pontoSemana')?.value);
  if (!funcId || !semId) return;
  pontoFuncId   = funcId;
  pontoSemanaId = semId;

  const func = DB.funcionarios.find(f => f.id === funcId);
  const sem  = DB.semanaPagamento.find(s => s.id === semId);
  if (!sem) return;

  // Days in range
  const days = [];
  const [y1, m1, d1] = sem.dataInicio.split('-').map(Number);
  const [y2, m2, d2] = sem.dataFim.split('-').map(Number);
  const cur = new Date(y1, m1 - 1, d1, 12, 0, 0);
  const end = new Date(y2, m2 - 1, d2, 12, 0, 0);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0,10));
    cur.setDate(cur.getDate() + 1);
  }

  const worked = DB.registrosPonto.filter(r => r.funcionarioId === funcId && r.semanaId === semId).map(r => r.dataTrabalho);

  const headers = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => `<div class="ponto-day header">${d}</div>`).join('');
  
  const startLocal = new Date(y1, m1 - 1, d1);
  const firstDay = startLocal.getDay();
  const blanks = Array(firstDay).fill(`<div class="ponto-day disabled"></div>`).join('');

  const dayCells = days.map(d => {
    const isWorked = worked.includes(d);
    const [y, m, dayVal] = d.split('-').map(Number);
    return `<div class="ponto-day ${isWorked?'worked':''}" onclick="togglePonto('${d}')" title="${d}">${dayVal}</div>`;
  }).join('');

  const totalDias = worked.length;
  const totalVal  = totalDias * (func.valorDiaria || 0);

  document.getElementById('pontoCalendar').innerHTML = `
    <div class="ponto-grid">${headers}${blanks}${dayCells}</div>`;
  document.getElementById('pontoResumo').innerHTML = `
    <div class="summary-row"><span class="label">Dias trabalhados na semana</span><span class="value">${totalDias} dias</span></div>
    <div class="summary-row"><span class="label">Valor por dia</span><span class="value">${fmt(func.valorDiaria)}</span></div>
    <div class="summary-row"><span class="label"><strong>Total a receber</strong></span><span class="value" style="color:var(--success);font-size:18px;font-weight:800">${fmt(totalVal)}</span></div>`;
}

function togglePonto(data) {
  if (!pontoFuncId || !pontoSemanaId) return;
  const idx = DB.registrosPonto.findIndex(r => r.funcionarioId === pontoFuncId && r.semanaId === pontoSemanaId && r.dataTrabalho === data);
  if (idx >= 0) {
    DB.registrosPonto.splice(idx, 1);
  } else {
    const func = DB.funcionarios.find(f => f.id === pontoFuncId);
    const obraId = parseInt(document.getElementById('pontoObra')?.value) || null;
    DB.registrosPonto.push({
      id: nextId('registrosPonto'),
      funcionarioId: pontoFuncId,
      semanaId: pontoSemanaId,
      obraId, dataTrabalho: data,
      valorDiaria: func.valorDiaria || 0,
      criado: new Date().toISOString()
    });
  }
  saveDB(DB);
  renderPontoCalendar();
}

// ======================================
// PAGAMENTOS (FOLHA SEMANAL)
// ======================================
function pagePagamentos() {
  if (globalFiltroMes !== 'all' && globalFiltroAno !== 'all' && globalFiltroTipo === 'MENSAL') {
    getSemanasMes(globalFiltroMes, globalFiltroAno);
  }

  const semanas = DB.semanaPagamento;
  const semanasMes = semanas.filter(s => isPeriodoValido(s.mes, s.ano));

  return `
  <div class="page-header">
    <div class="page-title"><h2>💳 Folha Semanal</h2><p>Pagamentos de funcionários por semana</p></div>
  </div>
  <div class="page-body">
    ${renderPeriodFilterCard('Período de Referência')}

    ${semanasMes.length === 0
      ? `<div class="empty-state"><div class="empty-icon">💳</div><p class="empty-title">Nenhuma semana criada</p><p class="empty-subtitle">Acesse "Cartão de Ponto" para criar as semanas do mês</p></div>`
      : semanasMes.map(s => renderFolhaSemana(s)).join('<div class="section-gap"></div>')
    }
  </div>`;
}

function renderFolhaSemana(sem) {
  const diaristas   = DB.funcionarios.filter(f => f.tipo === 'DIARISTA' && f.ativo);
  const empreiteiros = DB.funcionarios.filter(f => f.tipo === 'EMPREITEIRO' && f.ativo);

  const rowsDiaristas = diaristas.map(f => {
    const pontos = DB.registrosPonto.filter(r => r.funcionarioId === f.id && r.semanaId === sem.id);
    const valorDev = pontos.reduce((s,r) => s + r.valorDiaria, 0);
    const pag = DB.pagamentos.find(p => p.funcionarioId === f.id && p.semanaId === sem.id);
    return `<tr>
      <td><strong>${f.nome}</strong></td>
      <td><span class="badge badge-blue">DIARISTA</span></td>
      <td>${pontos.length} dias</td>
      <td class="td-number">${fmt(valorDev)}</td>
      <td>${pag ? `<span class="badge ${pag.status==='PAGO'?'badge-green':'badge-yellow'}">${pag.status}</span>` : '<span class="badge badge-gray">PENDENTE</span>'}</td>
      <td class="td-actions">
        ${pag ? `<button class="btn-icon" onclick="deletePagamento(${pag.id})" title="Estornar">↩️</button>`
               : `<button class="btn-success" onclick="modalPagamento(${f.id},${sem.id},${valorDev})">💰 Pagar</button>`}
      </td>
    </tr>`;
  }).join('');

  const rowsEmpreit = empreiteiros.map(f => {
    const emp = DB.empreitadas.find(e => e.funcionarioId === f.id && e.semanaId === sem.id);
    const valorDev = emp ? emp.valorTotal : 0;
    const pag = DB.pagamentos.find(p => p.funcionarioId === f.id && p.semanaId === sem.id);
    return `<tr>
      <td><strong>${f.nome}</strong></td>
      <td><span class="badge badge-orange">EMPREITEIRO</span></td>
      <td>${emp ? 'Empreitada registrada' : '—'}</td>
      <td class="td-number">${fmt(valorDev)}</td>
      <td>${pag ? `<span class="badge ${pag.status==='PAGO'?'badge-green':'badge-yellow'}">${pag.status}</span>` : '<span class="badge badge-gray">PENDENTE</span>'}</td>
      <td class="td-actions">
        ${emp
          ? (pag ? `<button class="btn-icon" onclick="deletePagamento(${pag.id})" title="Estornar">↩️</button>`
                 : `<button class="btn-success" onclick="modalPagamento(${f.id},${sem.id},${valorDev})">💰 Pagar</button>`)
          : `<button class="btn-warning" onclick="modalEmpreitada(${f.id},${sem.id})">📝 Empreitada</button>`
        }
      </td>
    </tr>`;
  }).join('');

  const totalSemana = [...diaristas, ...empreiteiros].reduce((s,f) => {
    const pag = DB.pagamentos.find(p => p.funcionarioId === f.id && p.semanaId === sem.id);
    return s + (pag?.valorPago || 0);
  }, 0);

  return `<div class="card">
    <div class="card-title" style="justify-content:space-between">
      <span>📅 Semana ${sem.numero} — ${fmtDate(sem.dataInicio)} a ${fmtDate(sem.dataFim)}</span>
      <span style="color:var(--primary);font-size:16px;font-weight:800">Total pago: ${fmt(totalSemana)}</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Funcionário</th><th>Tipo</th><th>Dias/Empreitada</th><th>Valor Devido</th><th>Status</th><th>Ação</th></tr></thead>
      <tbody>${rowsDiaristas}${rowsEmpreit}</tbody>
    </table></div>
  </div>`;
}

function modalEmpreitada(funcId, semId) {
  const f = DB.funcionarios.find(x => x.id === funcId);
  openModal(`Registrar Empreitada — ${f.nome}`, `
    <div class="form-group"><label>Obra</label>
      <select id="empObra">
        ${DB.obras.filter(o=>o.status==='ATIVA').map(o => `<option value="${o.id}">${o.nome}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Descrição do Serviço</label><textarea id="empDesc"></textarea></div>
    <div class="form-group"><label>Valor Total da Empreitada (R$)</label>
      <div class="input-prefix"><span>R$</span><input id="empValor" class="money-input" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarEmpreitada(${funcId},${semId})">💾 Salvar</button>
    </div>
  `);
}

function salvarEmpreitada(funcId, semId) {
  const valor = getMoneyValue('empValor');
  if (!valor) { showToast('Informe o valor', 'error'); return; }
  DB.empreitadas.push({
    id: nextId('empreitadas'),
    funcionarioId: funcId,
    semanaId: semId,
    obraId: parseInt(document.getElementById('empObra')?.value) || null,
    descricao: document.getElementById('empDesc')?.value,
    valorTotal: valor,
    criado: new Date().toISOString()
  });
  saveDB(DB);
  closeModal();
  showToast('Empreitada registrada!');
  navigate('pagamentos');
}

function modalPagamento(funcId, semId, valorCalc) {
  const f = DB.funcionarios.find(x => x.id === funcId);
  const bancosOpts = DB.bancos.map(b => `<option value="${b.id}">${b.nomeBanco}</option>`).join('');
  openModal(`Registrar Pagamento — ${f.nome}`, `
    <div class="info-box" style="margin-bottom:16px">Valor calculado: <strong>${fmt(valorCalc)}</strong></div>
    <div class="form-group"><label>Valor Pago (R$) *</label>
      <div class="input-prefix"><span>R$</span><input id="pagValor" class="money-input" value="${(valorCalc/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}" style="padding-left:38px" /></div>
    </div>
    <div class="form-group"><label>Forma de Pagamento</label>
      <select id="pagForma"><option>PIX</option><option>DINHEIRO</option><option>TRANSFERÊNCIA</option></select>
    </div>
    <div class="form-group"><label>Banco (se aplicável)</label>
      <select id="pagBanco"><option value="">Não vincular banco</option>${bancosOpts}</select>
    </div>
    <div class="form-group"><label>Data do Pagamento</label><input type="date" id="pagData" value="${todayStr()}" /></div>
    <div class="form-group"><label>Observação</label><input id="pagObs" /></div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarPagamento(${funcId},${semId},${valorCalc})">✅ Confirmar Pagamento</button>
    </div>
  `);
}

function salvarPagamento(funcId, semId, valorCalc) {
  const valorPago = getMoneyValue('pagValor');
  const bancoId   = parseInt(document.getElementById('pagBanco').value) || null;
  const data      = document.getElementById('pagData').value;

  // Debitar banco se selecionado
  if (bancoId) {
    DB.despesas.push({
      id: nextId('despesas'),
      bancoId, obraId: null,
      categoria: 'PESSOAL',
      descricao: `Pagamento funcionário — ${DB.funcionarios.find(f=>f.id===funcId)?.nome}`,
      valor: valorPago, data, criado: new Date().toISOString()
    });
  }

  DB.pagamentos.push({
    id: nextId('pagamentos'),
    funcionarioId: funcId,
    semanaId: semId,
    valorCalculado: valorCalc,
    valorPago,
    formaPagamento: document.getElementById('pagForma').value,
    bancoId,
    dataPagamento: data,
    status: 'PAGO',
    observacao: document.getElementById('pagObs').value,
    criado: new Date().toISOString()
  });

  saveDB(DB);
  closeModal();
  showToast('Pagamento registrado!');
  navigate('pagamentos');
}

function deletePagamento(id) {
  confirm_action('Estornar este pagamento?', () => {
    const pag = DB.pagamentos.find(p => p.id === id);
    DB.pagamentos = DB.pagamentos.filter(p => p.id !== id);
    // Remove despesa vinculada
    DB.despesas = DB.despesas.filter(d => !(d.bancoId === pag?.bancoId && d.descricao?.includes('funcionário')));
    saveDB(DB);
    showToast('Pagamento estornado.', 'warning');
    navigate('pagamentos');
  });
}

// ======================================
// DESPESAS
// ======================================
function pageDespesas() {
  const filtered = DB.despesas.filter(d => isDataValida(d.data));

  const rows = [...filtered].sort((a,b)=>b.id-a.id).map(d => {
    const banco = d.bancoId ? DB.bancos.find(b => b.id === d.bancoId) : null;
    const ent   = banco ? DB.entidades.find(e => e.id === banco.entidadeId) : null;
    return `<tr>
      <td>${fmtDate(d.data)}</td>
      <td>${banco ? banco.nomeBanco : '💵 Caixa em Espécie'}</td>
      <td>${ent ? `<span class="badge ${ent.tipo==='MEI'?'badge-orange':'badge-blue'}">${ent.tipo} ${ent.nome}</span>` : '—'}</td>
      <td><span class="badge badge-gray">${d.categoria}</span></td>
      <td>${d.descricao}</td>
      <td class="td-number" style="color:var(--danger)">− ${fmt(d.valor)}</td>
      <td class="td-actions"><button class="btn-icon" onclick="deleteDespesa(${d.id})" title="Excluir">🗑️</button></td>
    </tr>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>📋 Despesas</h2><p>Gastos corporativos que debitam dos bancos</p></div>
    <div class="page-actions">
      <button class="btn-primary" onclick="modalNovaDespesa()">➕ Nova Despesa</button>
    </div>
  </div>
  <div class="page-body">
    ${renderPeriodFilterCard('Visualizar Período')}

    ${filtered.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📋</div><p class="empty-title">Nenhuma despesa registrada para este período</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Data</th><th>Banco</th><th>Entidade</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

function modalNovaDespesa() {
  const bancosOpts = DB.bancos.map(b => {
    const ent = DB.entidades.find(e => e.id === b.entidadeId);
    return `<option value="${b.id}">${b.nomeBanco} (${ent?.tipo} ${ent?.nome})</option>`;
  }).join('');

  const fontOpts = `
    <option value="caixa">💵 Caixa em Espécie (Saldo: ${fmt(getSaldoCaixa())})</option>
    ${bancosOpts}
  `;

  openModal('Nova Despesa', `
    <div class="form-group"><label>Fonte de Pagamento *</label><select id="dBanco">${fontOpts}</select></div>
    <div class="form-group"><label>Categoria</label>
      <select id="dCat">
        <option>MATERIAL</option><option>FERRAMENTA</option><option>SERVIÇO</option><option>ADMINISTRATIVO</option><option>PESSOAL</option><option>OUTRO</option>
      </select>
    </div>
    <div class="form-group"><label>Obra (opcional)</label>
      <select id="dObra"><option value="">— Sem obra vinculada —</option>${DB.obras.filter(o=>o.status==='ATIVA').map(o=>`<option value="${o.id}">${o.nome}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Descrição *</label><input id="dDesc" placeholder="Ex: Compra de cimento..." /></div>
    <div class="form-group"><label>Valor (R$) *</label>
      <div class="input-prefix"><span>R$</span><input id="dValor" class="money-input" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="form-group"><label>Data</label><input type="date" id="dData" value="${todayStr()}" /></div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarDespesa()">💾 Registrar</button>
    </div>
  `);
}

function salvarDespesa() {
  const desc  = document.getElementById('dDesc').value.trim();
  const valor = getMoneyValue('dValor');
  const data  = document.getElementById('dData').value;
  if (!desc)  { showToast('Descrição é obrigatória', 'error'); return; }
  if (!valor) { showToast('Informe o valor', 'error'); return; }

  const fonteVal = document.getElementById('dBanco').value;
  const isCaixa = (fonteVal === 'caixa');
  const bancoId = isCaixa ? null : parseInt(fonteVal);
  const despesaId = nextId('despesas');

  if (isCaixa) {
    const saldoCaixa = getSaldoCaixa();
    if (saldoCaixa < valor) {
      showToast(`Saldo insuficiente no caixa. Saldo atual: ${fmt(saldoCaixa)}`, 'error');
      return;
    }
  }

  DB.despesas.push({
    id: despesaId,
    bancoId: bancoId,
    obraId:  parseInt(document.getElementById('dObra').value) || null,
    categoria: document.getElementById('dCat').value,
    descricao: desc, valor, data, criado: new Date().toISOString()
  });

  if (isCaixa) {
    DB.caixaMovimentos.push({
      id: nextId('caixaMovimentos'),
      tipo: 'SAIDA',
      valor: valor,
      obraId: parseInt(document.getElementById('dObra').value) || null,
      descricao: `Despesa: ${desc}`,
      data: data,
      entidadeDestino: null,
      bancoDestino: null,
      despesaId: despesaId,
      criado: new Date().toISOString()
    });
  }

  saveDB(DB);
  closeModal();
  showToast('Despesa registrada!');
  navigate('despesas');
}

function deleteDespesa(id) {
  confirm_action('Excluir esta despesa?', () => {
    DB.despesas = DB.despesas.filter(d => d.id !== id);
    DB.caixaMovimentos = DB.caixaMovimentos.filter(m => m.despesaId !== id);
    saveDB(DB);
    showToast('Despesa excluída.', 'warning');
    navigate('despesas');
  });
}

// ======================================
// MÓDULO PESSOAL
// ======================================
function pagePessoalDashboard() {
  const mes = globalFiltroMes;
  const ano = globalFiltroAno;

  const gastosMes = DB.gastosPessoais.filter(g => isPeriodoValido(g.mesRef, g.anoRef));
  const totalGastos = gastosMes.reduce((s, g) => s + g.valor, 0);
  
  const totalPago = gastosMes.filter(g => g.status === 'PAGO').reduce((s, g) => s + g.valor, 0);
  const totalPendente = gastosMes.filter(g => g.status !== 'PAGO').reduce((s, g) => s + g.valor, 0);
  
  let rendaPrev = 0;
  if (globalFiltroTipo === 'INTERVALO') {
    rendaPrev = DB.orcamentoMensal
      .filter(o => isPeriodoValido(o.mes, o.ano))
      .reduce((s, o) => s + o.rendaPrevista, 0);
  } else {
    const orc = DB.orcamentoMensal.find(o => isPeriodoValido(o.mes, o.ano));
    rendaPrev = orc?.rendaPrevista || 0;
  }
  const saldoLivre = rendaPrev - totalGastos;

  return `
  <div class="page-header">
    <div class="page-title"><h2>🏠 Dashboard Pessoal</h2><p>Controle financeiro da casa — ${getPeriodoFormatado()}</p></div>
    <div class="page-actions">
      <button class="btn-secondary" onclick="modalOrcamento()">⚙️ Configurar Orçamento</button>
    </div>
  </div>
  <div class="page-body">
    ${renderPeriodFilterCard('Visualizar Período')}

    <div class="grid-3" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon green">💰</div>
        <div class="stat-info"><div class="stat-label">Renda Prevista</div><div class="stat-value">${fmt(rendaPrev)}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">📉</div>
        <div class="stat-info"><div class="stat-label">Total Gastos</div><div class="stat-value" style="color:var(--danger)">${fmt(totalGastos)}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${saldoLivre>=0?'green':'red'}">
          ${saldoLivre>=0?'✅':'❌'}
        </div>
        <div class="stat-info"><div class="stat-label">Saldo Livre</div>
          <div class="stat-value" style="color:${saldoLivre>=0?'var(--success)':'var(--danger)'}">${fmt(Math.abs(saldoLivre))}</div>
          <div class="stat-change">${saldoLivre>=0?'Sobra':'Déficit'}</div>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">🟢 Pago vs 🟠 Pendente</div>
        <div class="chart-container"><canvas id="chartPessoal"></canvas></div>
        <div id="chartPessoalData" style="display:none">${JSON.stringify({pago:totalPago,pendente:totalPendente})}</div>
      </div>
      <div class="card">
        <div class="card-title">📋 Gastos do Período</div>
        ${gastosMes.length === 0
          ? `<div class="empty-state"><div class="empty-icon">🏠</div><p class="empty-title">Nenhum gasto registrado</p></div>`
          : `<div class="table-wrap"><table>
              <thead><tr><th>Descrição</th><th>Status</th><th>Valor</th></tr></thead>
              <tbody>${gastosMes.map(g=>`<tr>
                <td>${g.descricao} ${(g.parcelaTotal > 1) ? `(${g.parcelaNum}/${g.parcelaTotal})` : ''}</td>
                <td><span class="badge ${g.status==='PAGO'?'badge-green':'badge-orange'}">${g.status || 'PENDENTE'}</span></td>
                <td class="td-number" style="color:var(--danger)">${fmt(g.valor)}</td>
              </tr>`).join('')}</tbody>
            </table></div>`
        }
      </div>
    </div>
  </div>`;
}

function pagePessoalDespesas() {
  const gastos = DB.gastosPessoais.filter(g => isPeriodoValido(g.mesRef, g.anoRef));
  const total = gastos.reduce((s, g) => s + g.valor, 0);

  const rows = gastos.map(g => {
    const isPaid = g.status === 'PAGO';
    const statusBadge = `<span class="badge ${isPaid ? 'badge-green' : 'badge-orange'}" style="cursor: pointer; user-select: none;" onclick="toggleStatusGastoPessoal(${g.id})">${g.status || 'PENDENTE'}</span>`;
    const parcLabel = (g.parcelaTotal > 1) ? ` <span class="badge badge-gray" style="font-size:10px">${g.parcelaNum}/${g.parcelaTotal}</span>` : '';
    
    return `<tr>
      <td>${g.descricao}${parcLabel}</td>
      <td class="td-number" style="color:var(--danger)">${fmt(g.valor)}</td>
      <td>${fmtDate(g.data)}</td>
      <td>${statusBadge}</td>
      <td class="td-actions">
        <button class="btn-icon" onclick="deleteGastoPessoal(${g.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-title"><h2>📋 Despesas Pessoais</h2><p>${getPeriodoFormatado()}</p></div>
    <div class="page-actions">
      <button class="btn-primary" onclick="modalNovaDespesaPessoal()">➕ Nova Despesa</button>
    </div>
  </div>
  <div class="page-body">
    ${renderPeriodFilterCard('Visualizar Período')}

    <div class="stat-card" style="margin-bottom:20px;max-width:300px">
      <div class="stat-icon red">📉</div>
      <div class="stat-info">
        <div class="stat-label">Total de Despesas</div>
        <div class="stat-value" style="color:var(--danger)">${fmt(total)}</div>
      </div>
    </div>
    
    ${gastos.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📋</div><p class="empty-title">Nenhuma despesa registrada para este período</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Descrição</th><th>Valor</th><th>Data</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

function toggleStatusGastoPessoal(id) {
  const gasto = DB.gastosPessoais.find(g => g.id === id);
  if (gasto) {
    gasto.status = (gasto.status === 'PAGO') ? 'PENDENTE' : 'PAGO';
    saveDB(DB);
    showToast(gasto.status === 'PAGO' ? 'Despesa marcada como paga!' : 'Despesa marcada como pendente.');
    renderPage('pessoal-despesas');
  }
}

function modalNovaDespesaPessoal() {
  openModal('Nova Despesa Pessoal', `
    <div class="form-group">
      <label>Descrição (Rápido / Preset) *</label>
      <select id="pdGastoPreset" onchange="toggleGastoPreset()">
        <option value="💧 Água">💧 Água</option>
        <option value="⚡ Luz">⚡ Luz</option>
        <option value="🌐 Internet">🌐 Internet</option>
        <option value="🏠 Aluguel">🏠 Aluguel</option>
        <option value="🛒 Mercado">🛒 Mercado</option>
        <option value="⛽ Combustível">⛽ Combustível</option>
        <option value="💳 Fatura de Cartão">💳 Fatura de Cartão</option>
        <option value="📺 Assinaturas / Streaming">📺 Assinaturas / Streaming</option>
        <option value="🏢 IPTU">🏢 IPTU</option>
        <option value="🚗 IPVA">🚗 IPVA</option>
        <option value="CUSTOM">✍️ Outro (Customizado)...</option>
      </select>
    </div>
    <div class="form-group hidden" id="pdDescCustomWrap">
      <label>Descrição Customizada *</label>
      <input id="pdDescCustom" placeholder="Ex: Farmácia, Petshop, Academia..." />
    </div>
    <div class="form-group">
      <label>Valor (R$) *</label>
      <div class="input-prefix"><span>R$</span><input id="pdValor" class="money-input" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="form-group">
      <label>Data *</label>
      <input type="date" id="pdData" value="${todayStr()}" />
    </div>
    <div class="form-group">
      <label>Tipo de Pagamento</label>
      <select id="pdTipoPagamento" onchange="toggleParcelas()">
        <option value="UNICA">Parcela Única</option>
        <option value="PARCELADA">Parcelada</option>
      </select>
    </div>
    <div class="form-group hidden" id="pdParcelasWrap">
      <label>Número de Parcelas *</label>
      <input type="number" id="pdParcelasCount" min="2" max="120" value="3" />
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarDespesaPessoal()">💾 Salvar</button>
    </div>
  `);
}

function toggleGastoPreset() {
  const select = document.getElementById('pdGastoPreset');
  const wrap = document.getElementById('pdDescCustomWrap');
  if (select && wrap) {
    if (select.value === 'CUSTOM') {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }
}

function toggleParcelas() {
  const type = document.getElementById('pdTipoPagamento')?.value;
  const wrap = document.getElementById('pdParcelasWrap');
  if (wrap) {
    if (type === 'PARCELADA') wrap.classList.remove('hidden');
    else wrap.classList.add('hidden');
  }
}

function salvarDespesaPessoal() {
  const presetSelect = document.getElementById('pdGastoPreset');
  const customDesc = document.getElementById('pdDescCustom')?.value.trim();
  const valor = getMoneyValue('pdValor');
  const data = document.getElementById('pdData').value;
  const tipoPagamento = document.getElementById('pdTipoPagamento').value;
  
  let desc = presetSelect.value;
  if (desc === 'CUSTOM') {
    desc = customDesc;
  }
  
  if (!desc) { showToast('Informe a descrição da despesa', 'error'); return; }
  if (!valor) { showToast('Informe o valor', 'error'); return; }
  if (!data) { showToast('Informe a data', 'error'); return; }

  const baseDate = new Date(data + 'T12:00:00');
  
  if (tipoPagamento === 'UNICA') {
    const [y, m] = data.split('-').map(Number);
    DB.gastosPessoais.push({
      id: nextId('gastosPessoais'),
      tipo: 'FIXO',
      descricao: desc,
      valor,
      data,
      mesRef: m,
      anoRef: y,
      status: 'PENDENTE',
      parcelaNum: 1,
      parcelaTotal: 1,
      grupoParcelaId: null,
      criado: new Date().toISOString()
    });
    saveDB(DB);
  } else {
    const N = parseInt(document.getElementById('pdParcelasCount').value);
    if (!N || N < 2) { showToast('O número de parcelas deve ser pelo menos 2', 'error'); return; }
    
    const grupoId = Date.now();
    let nextSeq = DB.seq['gastosPessoais'] || 1;
    
    for (let idx = 1; idx <= N; idx++) {
      const currentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + (idx - 1), baseDate.getDate());
      const yyyy = currentDate.getFullYear();
      const mm = currentDate.getMonth() + 1;
      const mmStr = String(mm).padStart(2, '0');
      const ddStr = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mmStr}-${ddStr}`;
      
      DB.gastosPessoais.push({
        id: nextSeq++,
        tipo: 'FIXO',
        descricao: desc,
        valor,
        data: dateStr,
        mesRef: mm,
        anoRef: yyyy,
        status: 'PENDENTE',
        parcelaNum: idx,
        parcelaTotal: N,
        grupoParcelaId: grupoId,
        criado: new Date().toISOString()
      });
    }
    DB.seq['gastosPessoais'] = nextSeq;
    saveDB(DB);
  }
  
  closeModal();
  showToast('Despesa pessoal salva com sucesso!');
  renderPage('pessoal-despesas');
}

function deleteGastoPessoal(id) {
  const gasto = DB.gastosPessoais.find(g => g.id === id);
  if (!gasto) return;

  if (gasto.grupoParcelaId) {
    openModal('Excluir Despesa Parcelada', `
      <div style="margin-bottom: 16px; font-size: 14px; line-height: 1.5;">
        Esta despesa faz parte de um parcelamento (parcela ${gasto.parcelaNum}/${gasto.parcelaTotal}).<br>
        O que você deseja fazer?
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button class="btn-primary" onclick="confirmDeleteGastoPessoal(${id}, 'SINGLE')">🗑️ Excluir apenas esta parcela</button>
        <button class="btn-warning" onclick="confirmDeleteGastoPessoal(${id}, 'ALL')">🗑️ Excluir todo o parcelamento</button>
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      </div>
    `);
  } else {
    confirm_action('Excluir esta despesa?', () => {
      DB.gastosPessoais = DB.gastosPessoais.filter(g => g.id !== id);
      saveDB(DB);
      showToast('Despesa excluída.', 'warning');
      renderPage('pessoal-despesas');
    });
  }
}

function confirmDeleteGastoPessoal(id, mode) {
  const gasto = DB.gastosPessoais.find(g => g.id === id);
  if (gasto) {
    if (mode === 'ALL') {
      DB.gastosPessoais = DB.gastosPessoais.filter(g => g.grupoParcelaId !== gasto.grupoParcelaId);
      showToast('Todo o parcelamento foi excluído.', 'warning');
    } else {
      DB.gastosPessoais = DB.gastosPessoais.filter(g => g.id !== id);
      showToast('Parcela excluída com sucesso.', 'warning');
    }
    saveDB(DB);
    closeModal();
    renderPage('pessoal-despesas');
  }
}

function modalOrcamento() {
  const { mes, ano } = currentMonthYear();
  const orc = DB.orcamentoMensal.find(o => o.mes === mes && o.ano === ano);
  openModal('Configurar Orçamento Mensal', `
    <div class="form-group"><label>Renda Prevista (R$)</label>
      <div class="input-prefix"><span>R$</span><input id="orcRenda" class="money-input" value="${orc?.rendaPrevista?(orc.rendaPrevista/100).toLocaleString('pt-BR',{minimumFractionDigits:2}):''}" placeholder="0,00" style="padding-left:38px" /></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarOrcamento()">💾 Salvar</button>
    </div>
  `);
}

function salvarOrcamento() {
  const { mes, ano } = currentMonthYear();
  const renda = getMoneyValue('orcRenda');
  const idx   = DB.orcamentoMensal.findIndex(o => o.mes === mes && o.ano === ano);
  if (idx >= 0) DB.orcamentoMensal[idx].rendaPrevista = renda;
  else DB.orcamentoMensal.push({ id: nextId('orcamentoMensal'), mes, ano, rendaPrevista: renda });
  saveDB(DB);
  closeModal();
  showToast('Orçamento salvo!');
  navigate('pessoal-dashboard');
}

// ======================================
// CHARTS (Chart.js)
// ======================================
const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function initCharts() {
  // Chart Obras
  const obrasCanvas = document.getElementById('chartObras');
  if (obrasCanvas) {
    destroyChart('chartObras');
    const dataEl = document.getElementById('chartObrasData');
    const data   = dataEl ? JSON.parse(dataEl.textContent) : [];
    if (data.length === 0) {
      obrasCanvas.parentElement.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p class="empty-title" style="font-size:14px">Sem dados</p></div>`;
    } else {
      chartInstances['chartObras'] = new Chart(obrasCanvas, {
        type: 'bar',
        data: {
          labels: data.map(d => d.nome.slice(0,20)),
          datasets: [{ label: 'Faturado', data: data.map(d => d.fat/100),
            backgroundColor: currentTheme === 'tema3' ? 'rgba(124, 58, 237, 0.6)' : 'rgba(212,114,42,0.6)', 
            borderColor: currentTheme === 'tema3' ? '#7C3AED' : '#D4722A', 
            borderWidth: 2, borderRadius: 6 }]
        },
        options: chartOptions('R$')
      });
    }
  }

  // Chart Entidades
  const entCanvas = document.getElementById('chartEntidades');
  if (entCanvas) {
    destroyChart('chartEntidades');
    const mes = globalFiltroMes;
    const ano = globalFiltroAno;
    const ents  = DB.entidades.filter(e => e.tipo !== 'CAIXA');
    const vals  = ents.map(e => calcConsumoEntidade(e.id, mes, ano) / 100);
    const hasData = vals.some(v => v > 0);
    if (!hasData) {
      entCanvas.parentElement.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><p class="empty-title" style="font-size:14px">Sem recebimentos neste período</p></div>`;
    } else {
      chartInstances['chartEntidades'] = new Chart(entCanvas, {
        type: 'doughnut',
        data: {
          labels: ents.map(e => `${e.tipo} ${e.nome}`),
          datasets: [{ data: vals, 
            backgroundColor: currentTheme === 'tema3'
              ? ['#7C3AED','#A78BFA','#C4B5FD','#8B5CF6','#D8B4FE','#E9D5FF']
              : ['#D4722A','#F08040','#B05C1C','#3B82F6','#60A5FA','#93C5FD'],
            borderColor: currentTheme === 'tema3' ? '#FFFFFF' : '#131929', 
            borderWidth: 3 }]
        },
        options: { ...chartOptionsPie(), plugins: { ...chartOptionsPie().plugins, tooltip: { callbacks: { label: ctx => ` R$ ${ctx.parsed.toLocaleString('pt-BR',{minimumFractionDigits:2})}` } } } }
      });
    }
  }

  // Chart Pessoal
  const pesCanvas = document.getElementById('chartPessoal');
  if (pesCanvas) {
    destroyChart('chartPessoal');
    const dataEl = document.getElementById('chartPessoalData');
    const data   = dataEl ? JSON.parse(dataEl.textContent) : { pago: 0, pendente: 0 };
    if (!data.pago && !data.pendente) {
      pesCanvas.parentElement.innerHTML = `<div class="empty-state"><div class="empty-icon">🏠</div><p class="empty-title" style="font-size:14px">Sem despesas registradas</p></div>`;
    } else {
      chartInstances['chartPessoal'] = new Chart(pesCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Pago', 'Pendente'],
          datasets: [{ data: [data.pago/100, data.pendente/100],
            backgroundColor: currentTheme === 'tema3' ? ['#10B981','#F59E0B'] : ['#10B981','#F59E0B'], 
            borderColor: currentTheme === 'tema3' ? '#FFFFFF' : '#131929', 
            borderWidth: 3 }]
        },
        options: { ...chartOptionsPie(), plugins: { ...chartOptionsPie().plugins, tooltip: { callbacks: { label: ctx => ` R$ ${ctx.parsed.toLocaleString('pt-BR',{minimumFractionDigits:2})}` } } } }
      });
    }
  }
}

function chartOptions(prefix = '') {
  const isLight = currentTheme === 'tema3';
  const gridColor = isLight ? 'rgba(109, 40, 217, 0.08)' : 'rgba(255,255,255,0.05)';
  const tickColor = isLight ? '#5C4A78' : '#8B9CC8';
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` R$ ${ctx.parsed.y.toLocaleString('pt-BR',{minimumFractionDigits:2})}` } }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 }, callback: v => 'R$' + v.toLocaleString('pt-BR') } }
    }
  };
}

function chartOptionsPie() {
  const isLight = currentTheme === 'tema3';
  const tickColor = isLight ? '#5C4A78' : '#8B9CC8';
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: tickColor, padding: 16, font: { size: 12 } } }
    }
  };
}


// ============================================================
// MÓDULO CHECKLIST SEMANAL
// ============================================================

// Garante que os arrays existem em DBs antigos (migração)
function ensureChecklistDB() {
  if (!DB.checklistTopicos) DB.checklistTopicos = [];
  if (!DB.checklistTarefas) DB.checklistTarefas = [];
  if (!DB.seq.checklistTopicos) DB.seq.checklistTopicos = 1;
  if (!DB.seq.checklistTarefas) DB.seq.checklistTarefas = 1;
}

// Retorna a chave da semana no formato 'YYYY-WNN' baseada na segunda-feira
function getSemanaKey(date) {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  const year = monday.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const weekNo = Math.ceil(((monday - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2,'0')}`;
}

function getSemanaLabel(key) {
  if (!key) return '';
  const [yearStr, weekStr] = key.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);
  const jan1 = new Date(year, 0, 1);
  const dayOfJan1 = jan1.getDay() || 7;
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + (8 - dayOfJan1) % 7);
  const monday = new Date(firstMonday);
  monday.setDate(firstMonday.getDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const f = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  return `Semana ${week} — ${f(monday)} a ${f(sunday)}/${year}`;
}

function getSemanasList(qtd = 16) {
  const semanas = [];
  const d = new Date();
  const seen = new Set();
  for (let i = 0; i < qtd; i++) {
    const key = getSemanaKey(new Date(d));
    if (!seen.has(key)) {
      seen.add(key);
      semanas.push({ key, label: getSemanaLabel(key) });
    }
    d.setDate(d.getDate() - 7);
  }
  return semanas;
}

let checklistObraId = null;
let checklistSemana = null;

function pageChecklist() {
  ensureChecklistDB();
  if (!checklistSemana) checklistSemana = getSemanaKey();

  const obras = DB.obras;
  if (!checklistObraId && obras.length > 0) checklistObraId = obras[0].id;

  const semanas = getSemanasList(16);
  const obra = obras.find(o => o.id === checklistObraId);

  const topicos = DB.checklistTopicos.filter(t => t.obraId === checklistObraId && t.semana === checklistSemana);
  const totalTarefas = DB.checklistTarefas.filter(t => t.obraId === checklistObraId && t.semana === checklistSemana).length;
  const concluidas = DB.checklistTarefas.filter(t => t.obraId === checklistObraId && t.semana === checklistSemana && t.concluida).length;
  const progresso = totalTarefas > 0 ? Math.round((concluidas / totalTarefas) * 100) : 0;
  const progressColor = progresso >= 100 ? '#22c55e' : progresso >= 60 ? '#f59e0b' : '#3b82f6';

  let topicosHTML = '';
  if (topicos.length === 0) {
    topicosHTML = `
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-icon">📋</div>
        <p class="empty-title">Nenhum tópico ainda</p>
        <p class="empty-sub">Clique em "+ Novo Tópico" para começar a organizar a semana</p>
      </div>`;
  } else {
    topicosHTML = topicos.map(tp => {
      const tarefas = DB.checklistTarefas.filter(t => t.topicoId === tp.id);
      const tpConcluidas = tarefas.filter(t => t.concluida).length;
      const tpTotal = tarefas.length;
      const tpPct = tpTotal > 0 ? Math.round((tpConcluidas / tpTotal) * 100) : 0;
      const tpColor = tpPct >= 100 ? '#22c55e' : tpPct >= 60 ? '#f59e0b' : '#3b82f6';

      const tarefasHTML = tarefas.map(tf => `
        <div class="cl-tarefa-item">
          <label class="cl-checkbox-wrap">
            <input type="checkbox" ${tf.concluida ? 'checked' : ''}
              onchange="clToggleTarefa(${tf.id})" id="clChk-${tf.id}" />
            <span class="cl-custom-check"></span>
            <span class="cl-tarefa-text ${tf.concluida ? 'concluida' : ''}" id="clText-${tf.id}"
              ondblclick="clEditarTarefa(${tf.id})">${tf.texto}</span>
          </label>
          <div class="cl-tarefa-actions">
            <button class="cl-btn-edit" onclick="clEditarTarefa(${tf.id})" title="Editar">✏️</button>
            <button class="cl-btn-del" onclick="clDeletarTarefa(${tf.id})" title="Excluir">🗑️</button>
          </div>
        </div>
      `).join('');

      return `
      <div class="cl-topico-card">
        <div class="cl-topico-header">
          <div class="cl-topico-info">
            <span class="cl-topico-icon">📌</span>
            <span class="cl-topico-nome">${tp.nome}</span>
            <span class="cl-topico-badge">${tpConcluidas}/${tpTotal}</span>
          </div>
          <div class="cl-topico-actions">
            <button class="cl-btn-icon" onclick="clEditarTopico(${tp.id})" title="Renomear">✏️</button>
            <button class="cl-btn-icon cl-btn-danger" onclick="clArquivarTopico(${tp.id})" title="Excluir tópico">🗑️</button>
          </div>
        </div>
        ${tpTotal > 0 ? `<div class="cl-mini-bar"><div class="cl-mini-fill" style="width:${tpPct}%;background:${tpColor}"></div></div>` : ''}
        <div class="cl-tarefas-list">
          ${tarefasHTML || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Nenhuma tarefa. Adicione abaixo.</div>'}
        </div>
        <div class="cl-add-tarefa-row">
          <input type="text" id="clNewTarefa-${tp.id}" class="cl-input-inline"
            placeholder="+ Nova tarefa... (Enter para adicionar)"
            onkeydown="if(event.key==='Enter') clAdicionarTarefa(${tp.id})" />
          <button class="cl-btn-add" onclick="clAdicionarTarefa(${tp.id})">Adicionar</button>
        </div>
      </div>`;
    }).join('');
  }

  const obrasOptions = obras.map(o => `<option value="${o.id}" ${o.id === checklistObraId ? 'selected' : ''}>${o.nome}</option>`).join('');
  const semanasOptions = semanas.map(s => `<option value="${s.key}" ${s.key === checklistSemana ? 'selected' : ''}>${s.label}</option>`).join('');

  return `
  <div class="page-header">
    <div class="page-title">
      <h2>✅ Programação e Checklist Semanal</h2>
      <p>Planejamento semanal por obra — bloco de notas inteligente</p>
    </div>
  </div>
  <div class="page-body">

    <!-- FILTROS -->
    <div class="card cl-filtros-card">
      <div class="cl-filtros-row">
        <div class="form-group" style="margin:0;flex:1">
          <label>🏚️ Obra</label>
          <select id="clSelectObra" onchange="clChangeObra(this.value)">
            ${obras.length === 0 ? '<option value="">Nenhuma obra cadastrada</option>' : obrasOptions}
          </select>
        </div>
        <div class="form-group" style="margin:0;flex:1.5">
          <label>📅 Semana de Referência</label>
          <select id="clSelectSemana" onchange="clChangeSemana(this.value)">
            ${semanasOptions}
          </select>
        </div>
        ${obras.length > 0 ? `<button class="btn-primary" onclick="clNovoTopico()" style="align-self:flex-end;white-space:nowrap;height:42px">+ Novo Tópico</button>` : ''}
      </div>
    </div>

    <!-- BARRA DE PROGRESSO GLOBAL -->
    <div class="card cl-progresso-card">
      <div class="cl-prog-header">
        <span class="cl-prog-label">Progresso da Semana</span>
        <span class="cl-prog-pct" style="color:${progressColor}">${progresso}%</span>
      </div>
      <div class="cl-prog-bar-bg">
        <div class="cl-prog-bar-fill" style="width:${progresso}%;background:${progressColor};transition:width 0.6s ease"></div>
      </div>
      <div class="cl-prog-sub">
        <span>✅ ${concluidas} concluídas</span>
        <span>📋 ${totalTarefas} total</span>
        <span>${progresso >= 100 ? '🎉 Semana concluída!' : `${totalTarefas - concluidas} pendentes`}</span>
      </div>
    </div>

    <!-- TÓPICOS + TAREFAS -->
    <div id="clTopicosContainer">
      ${obras.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🏗️</div>
          <p class="empty-title">Nenhuma obra cadastrada</p>
          <p class="empty-sub">Cadastre uma obra primeiro para criar checklists</p>
        </div>` : topicosHTML}
    </div>

    <!-- HISTÓRICO -->
    <div class="card" style="margin-top:24px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 class="card-title" style="margin:0">📚 Histórico de Checklists</h3>
      </div>
      ${clRenderHistorico()}
    </div>

  </div>`;
}

function clChangeObra(val) {
  checklistObraId = parseInt(val) || null;
  renderPage('checklist');
}

function clChangeSemana(val) {
  checklistSemana = val;
  renderPage('checklist');
}

function clNovoTopico() {
  ensureChecklistDB();
  openModal('Novo Tópico', `
    <div class="form-group">
      <label>Nome do Tópico</label>
      <input type="text" id="clNomeTopico" placeholder="Ex: Materiais a Entregar, Metas da Semana..." />
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="clSalvarNovoTopico()">Criar Tópico</button>
    </div>
  `);
  setTimeout(() => document.getElementById('clNomeTopico')?.focus(), 100);
}

function clSalvarNovoTopico() {
  ensureChecklistDB();
  const nome = document.getElementById('clNomeTopico')?.value?.trim();
  if (!nome) { showToast('Digite o nome do tópico', 'error'); return; }
  if (!checklistObraId) { showToast('Selecione uma obra primeiro', 'error'); return; }

  const topico = {
    id: nextId('checklistTopicos'),
    obraId: checklistObraId,
    semana: checklistSemana,
    nome,
    criadoEm: new Date().toISOString()
  };
  DB.checklistTopicos.push(topico);
  saveDB(DB);
  closeModal();
  showToast('Tópico criado!');
  renderPage('checklist');
}

function clEditarTopico(topicoId) {
  const tp = DB.checklistTopicos.find(t => t.id === topicoId);
  if (!tp) return;
  openModal('Renomear Tópico', `
    <div class="form-group">
      <label>Nome do Tópico</label>
      <input type="text" id="clEditNomeTopico" value="${tp.nome.replace(/"/g,'&quot;')}" />
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="clSalvarEditTopico(${topicoId})">Salvar</button>
    </div>
  `);
  setTimeout(() => document.getElementById('clEditNomeTopico')?.focus(), 100);
}

function clSalvarEditTopico(topicoId) {
  const nome = document.getElementById('clEditNomeTopico')?.value?.trim();
  if (!nome) { showToast('Nome inválido', 'error'); return; }
  const tp = DB.checklistTopicos.find(t => t.id === topicoId);
  if (tp) { tp.nome = nome; saveDB(DB); }
  closeModal();
  showToast('Tópico renomeado!');
  renderPage('checklist');
}

function clArquivarTopico(topicoId) {
  confirm_action('Deseja excluir este tópico e todas as suas tarefas?', () => {
    DB.checklistTopicos = DB.checklistTopicos.filter(t => t.id !== topicoId);
    DB.checklistTarefas = DB.checklistTarefas.filter(t => t.topicoId !== topicoId);
    saveDB(DB);
    showToast('Tópico excluído!');
    renderPage('checklist');
  });
}

function clAdicionarTarefa(topicoId) {
  ensureChecklistDB();
  const input = document.getElementById(`clNewTarefa-${topicoId}`);
  const texto = input?.value?.trim();
  if (!texto) return;

  const tp = DB.checklistTopicos.find(t => t.id === topicoId);
  if (!tp) return;

  const tarefa = {
    id: nextId('checklistTarefas'),
    topicoId,
    obraId: tp.obraId,
    semana: tp.semana,
    texto,
    concluida: false,
    criadoEm: new Date().toISOString()
  };
  DB.checklistTarefas.push(tarefa);
  saveDB(DB);
  if (input) input.value = '';
  renderPage('checklist');
  setTimeout(() => document.getElementById(`clNewTarefa-${topicoId}`)?.focus(), 60);
}

function clToggleTarefa(tarefaId) {
  ensureChecklistDB();
  const tf = DB.checklistTarefas.find(t => t.id === tarefaId);
  if (!tf) return;
  tf.concluida = !tf.concluida;
  tf.concluidaEm = tf.concluida ? new Date().toISOString() : null;
  saveDB(DB);
  // Atualiza o texto sem re-renderizar tudo
  const textEl = document.getElementById(`clText-${tarefaId}`);
  if (textEl) textEl.classList.toggle('concluida', tf.concluida);
  // Atualiza as barras de progresso
  clAtualizarProgresso();
}

function clAtualizarProgresso() {
  const totalTarefas = DB.checklistTarefas.filter(t => t.obraId === checklistObraId && t.semana === checklistSemana).length;
  const concluidas = DB.checklistTarefas.filter(t => t.obraId === checklistObraId && t.semana === checklistSemana && t.concluida).length;
  const progresso = totalTarefas > 0 ? Math.round((concluidas / totalTarefas) * 100) : 0;
  const progressColor = progresso >= 100 ? '#22c55e' : progresso >= 60 ? '#f59e0b' : '#3b82f6';

  const pctEl = document.querySelector('.cl-prog-pct');
  const fillEl = document.querySelector('.cl-prog-bar-fill');
  const subEl = document.querySelector('.cl-prog-sub');

  if (pctEl) { pctEl.textContent = progresso + '%'; pctEl.style.color = progressColor; }
  if (fillEl) { fillEl.style.width = progresso + '%'; fillEl.style.background = progressColor; }
  if (subEl) {
    subEl.innerHTML = `
      <span>✅ ${concluidas} concluídas</span>
      <span>📋 ${totalTarefas} total</span>
      <span>${progresso >= 100 ? '🎉 Semana concluída!' : `${totalTarefas - concluidas} pendentes`}</span>`;
  }
}

function clEditarTarefa(tarefaId) {
  const tf = DB.checklistTarefas.find(t => t.id === tarefaId);
  if (!tf) return;
  openModal('Editar Tarefa', `
    <div class="form-group">
      <label>Descrição da Tarefa</label>
      <input type="text" id="clEditTarefaText" value="${tf.texto.replace(/"/g,'&quot;')}" />
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="clSalvarEditTarefa(${tarefaId})">Salvar</button>
    </div>
  `);
  setTimeout(() => document.getElementById('clEditTarefaText')?.focus(), 100);
}

function clSalvarEditTarefa(tarefaId) {
  const texto = document.getElementById('clEditTarefaText')?.value?.trim();
  if (!texto) { showToast('Texto inválido', 'error'); return; }
  const tf = DB.checklistTarefas.find(t => t.id === tarefaId);
  if (tf) { tf.texto = texto; saveDB(DB); }
  closeModal();
  showToast('Tarefa atualizada!');
  renderPage('checklist');
}

function clDeletarTarefa(tarefaId) {
  DB.checklistTarefas = DB.checklistTarefas.filter(t => t.id !== tarefaId);
  saveDB(DB);
  showToast('Tarefa removida!');
  renderPage('checklist');
}

function clRenderHistorico() {
  ensureChecklistDB();
  const grupos = {};
  DB.checklistTopicos.forEach(tp => {
    const key = `${tp.obraId}__${tp.semana}`;
    if (!grupos[key]) {
      const obra = DB.obras.find(o => o.id === tp.obraId);
      const tarefasTotal = DB.checklistTarefas.filter(t => t.obraId === tp.obraId && t.semana === tp.semana).length;
      const tarefasConcluidas = DB.checklistTarefas.filter(t => t.obraId === tp.obraId && t.semana === tp.semana && t.concluida).length;
      grupos[key] = {
        obraId: tp.obraId,
        obraNome: obra ? obra.nome : 'Obra removida',
        semana: tp.semana,
        semanaLabel: getSemanaLabel(tp.semana),
        tarefasTotal,
        tarefasConcluidas,
        topicosCount: 0
      };
    }
    grupos[key].topicosCount++;
  });

  const lista = Object.values(grupos).sort((a, b) => b.semana.localeCompare(a.semana));

  if (lista.length === 0) {
    return `<div class="empty-state" style="padding:24px"><div class="empty-icon">📚</div><p class="empty-title">Nenhum histórico ainda</p></div>`;
  }

  return `
  <table class="data-table">
    <thead>
      <tr>
        <th>Obra</th>
        <th>Semana</th>
        <th>Tópicos</th>
        <th>Progresso</th>
        <th>Ações</th>
      </tr>
    </thead>
    <tbody>
      ${lista.map(g => {
        const pct = g.tarefasTotal > 0 ? Math.round((g.tarefasConcluidas / g.tarefasTotal) * 100) : 0;
        const cor = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#3b82f6';
        const isActive = g.obraId === checklistObraId && g.semana === checklistSemana;
        return `<tr ${isActive ? 'style="background:rgba(59,130,246,0.08)"' : ''}>
          <td><strong>${g.obraNome}</strong></td>
          <td style="font-size:12px;color:var(--text-secondary)">${g.semanaLabel}</td>
          <td><span class="badge badge-blue">${g.topicosCount} tópicos</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="gauge-bar" style="flex:1;height:6px">
                <div class="gauge-fill" style="width:${pct}%;background:${cor}"></div>
              </div>
              <span style="font-size:12px;font-weight:600;color:${cor};min-width:36px">${pct}%</span>
            </div>
          </td>
          <td>
            <button class="btn-secondary" style="font-size:11px;padding:4px 10px"
              onclick="clVerChecklist(${g.obraId},'${g.semana}')">Ver</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

function clVerChecklist(obraId, semana) {
  checklistObraId = obraId;
  checklistSemana = semana;
  renderPage('checklist');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ============================================================
// MÓDULO CONFIGURAÇÕES — TEMAS E APARÊNCIA
// ============================================================

const THEME_KEY = 'gp_theme_v1';
let currentTheme = localStorage.getItem(THEME_KEY) || 'tema1';

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
  if (typeof initCharts === 'function') initCharts();
}

// Aplica o tema salvo ao carregar
applyTheme(currentTheme);

function pageConfiguracoes() {
  const t1Active = currentTheme === 'tema1';
  const t2Active = currentTheme === 'tema2';
  const t3Active = currentTheme === 'tema3';

  return `
  <div class="page-header">
    <div class="page-title">
      <h2>⚙️ Configurações</h2>
      <p>Personalize a aparência do sistema</p>
    </div>
  </div>
  <div class="page-body">

    <div class="card cfg-card">
      <h3 class="cfg-section-title">🎨 Tema de Cores</h3>
      <p class="cfg-section-desc">Escolha o tema visual do sistema. A alteração é aplicada instantaneamente e salva automaticamente.</p>

      <div class="cfg-themes-grid">

        <!-- TEMA 1 — ATUAL (Escuro com Laranja) -->
        <div class="cfg-theme-card ${t1Active ? 'active' : ''}" onclick="setTheme('tema1')" id="themeCard1">
          <div class="cfg-theme-preview tema1-preview">
            <div class="cfg-prev-sidebar">
              <div class="cfg-prev-logo"></div>
              <div class="cfg-prev-nav-item"></div>
              <div class="cfg-prev-nav-item active"></div>
              <div class="cfg-prev-nav-item"></div>
              <div class="cfg-prev-nav-item"></div>
            </div>
            <div class="cfg-prev-main">
              <div class="cfg-prev-card">
                <div class="cfg-prev-stat"></div>
                <div class="cfg-prev-stat accent"></div>
              </div>
              <div class="cfg-prev-card">
                <div class="cfg-prev-bar"></div>
                <div class="cfg-prev-bar short"></div>
              </div>
            </div>
          </div>
          <div class="cfg-theme-info">
            <div class="cfg-theme-name">
              🏗️ Tema Construtora
              ${t1Active ? '<span class="cfg-badge-active">ATIVO</span>' : ''}
            </div>
            <p class="cfg-theme-desc">Fundo escuro profundo com destaque laranja-âmbar. Tema atual profissional da Gilson Passos Construtora.</p>
            <div class="cfg-color-dots">
              <span class="cfg-dot" style="background:#0B0F1A" title="Fundo Base"></span>
              <span class="cfg-dot" style="background:#131929" title="Card"></span>
              <span class="cfg-dot" style="background:#D4722A" title="Primária"></span>
              <span class="cfg-dot" style="background:#F0F4FF" title="Texto"></span>
            </div>
          </div>
          <button class="cfg-btn-select ${t1Active ? 'selected' : ''}" onclick="event.stopPropagation();setTheme('tema1')">
            ${t1Active ? '✅ Tema Ativo' : 'Ativar Tema'}
          </button>
        </div>

        <!-- TEMA 2 — ROSA -->
        <div class="cfg-theme-card ${t2Active ? 'active' : ''}" onclick="setTheme('tema2')" id="themeCard2">
          <div class="cfg-theme-preview tema2-preview">
            <div class="cfg-prev-sidebar t2">
              <div class="cfg-prev-logo t2"></div>
              <div class="cfg-prev-nav-item t2"></div>
              <div class="cfg-prev-nav-item t2 active"></div>
              <div class="cfg-prev-nav-item t2"></div>
              <div class="cfg-prev-nav-item t2"></div>
            </div>
            <div class="cfg-prev-main t2">
              <div class="cfg-prev-card t2">
                <div class="cfg-prev-stat t2"></div>
                <div class="cfg-prev-stat t2 accent"></div>
              </div>
              <div class="cfg-prev-card t2">
                <div class="cfg-prev-bar t2"></div>
                <div class="cfg-prev-bar t2 short"></div>
              </div>
            </div>
          </div>
          <div class="cfg-theme-info">
            <div class="cfg-theme-name">
              🌸 Tema Rosa
              ${t2Active ? '<span class="cfg-badge-active">ATIVO</span>' : ''}
            </div>
            <p class="cfg-theme-desc">Paleta rosa escuro, rosa claro e branco. Elegante e moderno, com contraste suave e sofisticado.</p>
            <div class="cfg-color-dots">
              <span class="cfg-dot" style="background:#1A0A12" title="Fundo Base"></span>
              <span class="cfg-dot" style="background:#2D1020" title="Card"></span>
              <span class="cfg-dot" style="background:#E91E8C" title="Primária"></span>
              <span class="cfg-dot" style="background:#FFB6D9" title="Rosa Claro"></span>
              <span class="cfg-dot" style="background:#FFFFFF" title="Branco"></span>
            </div>
          </div>
          <button class="cfg-btn-select ${t2Active ? 'selected' : ''}" onclick="event.stopPropagation();setTheme('tema2')">
            ${t2Active ? '✅ Tema Ativo' : 'Ativar Tema'}
          </button>
        </div>

        <!-- TEMA 3 — ROXO E BRANCO -->
        <div class="cfg-theme-card ${t3Active ? 'active' : ''}" onclick="setTheme('tema3')" id="themeCard3">
          <div class="cfg-theme-preview tema3-preview">
            <div class="cfg-prev-sidebar t3">
              <div class="cfg-prev-logo t3"></div>
              <div class="cfg-prev-nav-item t3"></div>
              <div class="cfg-prev-nav-item t3 active"></div>
              <div class="cfg-prev-nav-item t3"></div>
              <div class="cfg-prev-nav-item t3"></div>
            </div>
            <div class="cfg-prev-main t3">
              <div class="cfg-prev-card t3">
                <div class="cfg-prev-stat t3"></div>
                <div class="cfg-prev-stat t3 accent"></div>
              </div>
              <div class="cfg-prev-card t3">
                <div class="cfg-prev-bar t3"></div>
                <div class="cfg-prev-bar t3 short"></div>
              </div>
            </div>
          </div>
          <div class="cfg-theme-info">
            <div class="cfg-theme-name">
              💜 Tema Roxo
              ${t3Active ? '<span class="cfg-badge-active">ATIVO</span>' : ''}
            </div>
            <p class="cfg-theme-desc">Paleta de roxo escuro, roxo pastel e branco. Visual limpo, de alto contraste e sem cores escuras.</p>
            <div class="cfg-color-dots">
              <span class="cfg-dot" style="background:#FFFFFF" title="Fundo Base"></span>
              <span class="cfg-dot" style="background:#EFEBF7" title="Card"></span>
              <span class="cfg-dot" style="background:#7C3AED" title="Primária"></span>
              <span class="cfg-dot" style="background:#C4B5FD" title="Roxo Pastel"></span>
              <span class="cfg-dot" style="background:#1E0A3D" title="Texto"></span>
            </div>
          </div>
          <button class="cfg-btn-select ${t3Active ? 'selected' : ''}" onclick="event.stopPropagation();setTheme('tema3')">
            ${t3Active ? '✅ Tema Ativo' : 'Ativar Tema'}
          </button>
        </div>

      </div>
    </div>



    <!-- SEÇÃO DE EXPORTAR/IMPORTAR DADOS -->
    <div class="card cfg-card" style="margin-top: 24px;">
      <h3 class="cfg-section-title">🛡️ Backup e Segurança dos Dados</h3>
      <p class="cfg-section-desc">Exporte ou importe todas as informações do sistema (obras, recebimentos, caixa, bancos, funcionários, ponto e configurações) para fins de segurança e backup.</p>
      
      <div style="display: flex; gap: 14px; margin-top: 20px; flex-wrap: wrap;">
        <button class="btn-primary" onclick="exportarDados()" style="display: flex; align-items: center; gap: 8px; padding: 12px 20px; font-size: 14px; font-weight: 600;">
          📤 Exportar Dados (Backup)
        </button>
        
        <button class="btn-secondary" onclick="document.getElementById('importFileInput').click()" style="display: flex; align-items: center; gap: 8px; padding: 12px 20px; font-size: 14px; font-weight: 600; border: 1px solid var(--border);">
          📥 Importar Dados (Restaurar)
        </button>
        
        <input type="file" id="importFileInput" accept=".json" style="display: none;" onchange="importarDados(event)" />
      </div>
    </div>

    <!-- INFO -->
    <div class="card cfg-info-card">
      <div class="cfg-info-row">
        <span class="cfg-info-icon">💾</span>
        <div>
          <div class="cfg-info-title">Salvamento automático</div>
          <div class="cfg-info-sub">O tema escolhido é salvo localmente e aplicado automaticamente sempre que o sistema for aberto.</div>
        </div>
      </div>
      <div class="cfg-info-row">
        <span class="cfg-info-icon">📱</span>
        <div>
          <div class="cfg-info-title">Todos os dispositivos</div>
          <div class="cfg-info-sub">O tema se adapta automaticamente para uso em celulares, tablets e computadores.</div>
        </div>
      </div>
    </div>

  </div>`;
}

function setTheme(theme) {
  applyTheme(theme);
  // Re-renderiza a página para atualizar os botões ativos
  renderPage('configuracoes');
  showToast(theme === 'tema1' ? '🏗️ Tema Construtora ativado!' : theme === 'tema2' ? '🌸 Tema Rosa ativado!' : '💜 Tema Roxo ativado!');
}

function exportarDados() {
  try {
    const backup = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      db: loadDB(),
      auth: loadAuth()
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, "-");
    downloadAnchor.setAttribute("download", `backup-gp-sistema-${dateStr}_${timeStr}.json`);
    
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    
    showToast("Dados exportados com sucesso!");
  } catch (err) {
    showToast("Erro ao exportar dados.", "error");
    console.error(err);
  }
}

function importarDados(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      
      // Validações básicas do backup
      if (!backup || !backup.db) {
        showToast("Arquivo de backup inválido.", "error");
        return;
      }

      confirm_action("Atenção: Importar este arquivo substituirá TODOS os dados atuais do sistema. Deseja continuar?", () => {
        // Salva os dados importados no localStorage
        localStorage.setItem(DB_KEY, JSON.stringify(backup.db));
        localStorage.setItem(DB_KEY + '_last_local_edit', new Date().toISOString());
        localStorage.setItem(DB_KEY + '_last_sync', new Date().toISOString());
        if (backup.auth) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(backup.auth));
        }

        // Recarrega o banco de dados na memória global
        DB = loadDB();
        
        showToast("Dados importados com sucesso! O sistema será reiniciado.");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      });
    } catch (err) {
      showToast("Erro ao processar arquivo de backup.", "error");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

// ======================================
// AGENDA & CALENDÁRIO
// ======================================
let currentCalendarMonth = null;
let currentCalendarYear = null;

function pageAgenda() {
  const now = new Date();
  if (currentCalendarMonth === null) currentCalendarMonth = now.getMonth();
  if (currentCalendarYear === null) currentCalendarYear = now.getFullYear();

  // Nome do mês atual
  const mesNome = NOME_MESES[currentCalendarMonth];

  // Algoritmo de geração do calendário mensal
  const primeiroDia = new Date(currentCalendarYear, currentCalendarMonth, 1);
  const diaSemanaInicial = primeiroDia.getDay(); // 0 = Domingo, 1 = Segunda, etc.
  const totalDiasMes = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
  const totalDiasMesAnterior = new Date(currentCalendarYear, currentCalendarMonth, 0).getDate();

  let daysHtml = '';

  // 1. Dias do mês anterior (padding/cinzas)
  for (let i = diaSemanaInicial - 1; i >= 0; i--) {
    const diaNum = totalDiasMesAnterior - i;
    const paddingMonth = currentCalendarMonth === 0 ? 11 : currentCalendarMonth - 1;
    const paddingYear = currentCalendarMonth === 0 ? currentCalendarYear - 1 : currentCalendarYear;
    const dateStr = `${paddingYear}-${String(paddingMonth + 1).padStart(2, '0')}-${String(diaNum).padStart(2, '0')}`;
    daysHtml += renderCalendarCell(diaNum, dateStr, true);
  }

  // 2. Dias do mês atual
  for (let diaNum = 1; diaNum <= totalDiasMes; diaNum++) {
    const dateStr = `${currentCalendarYear}-${String(currentCalendarMonth + 1).padStart(2, '0')}-${String(diaNum).padStart(2, '0')}`;
    const isToday = now.getDate() === diaNum && now.getMonth() === currentCalendarMonth && now.getFullYear() === currentCalendarYear;
    daysHtml += renderCalendarCell(diaNum, dateStr, false, isToday);
  }

  // 3. Dias do próximo mês (padding/cinzas até fechar 42 células)
  const totalCelulas = diaSemanaInicial + totalDiasMes;
  const celulasRestantes = totalCelulas > 35 ? 42 - totalCelulas : 35 - totalCelulas;
  for (let diaNum = 1; diaNum <= celulasRestantes; diaNum++) {
    const paddingMonth = currentCalendarMonth === 11 ? 0 : currentCalendarMonth + 1;
    const paddingYear = currentCalendarMonth === 11 ? currentCalendarYear + 1 : currentCalendarYear;
    const dateStr = `${paddingYear}-${String(paddingMonth + 1).padStart(2, '0')}-${String(diaNum).padStart(2, '0')}`;
    daysHtml += renderCalendarCell(diaNum, dateStr, true);
  }

  return `
    <div class="page-header">
      <div class="page-title">
        <h2>📅 Agenda de Obrigações</h2>
        <p>Acompanhe e agende tarefas e compromissos importantes</p>
      </div>
    </div>
    <div class="page-body">
      <div class="calendar-container">
        <div class="calendar-header">
          <div class="calendar-title-nav">
            <button class="calendar-nav-btn" onclick="navigateCalendar(-1)">◀</button>
            <span class="calendar-view-title">${mesNome} ${currentCalendarYear}</span>
            <button class="calendar-nav-btn" onclick="navigateCalendar(1)">▶</button>
          </div>
          <button class="btn-primary" onclick="modalNovoEvento('${todayStr()}')">➕ Novo Agendamento</button>
        </div>
        
        <div class="calendar-grid">
          <div class="calendar-weekdays">
            <div>Domingo</div>
            <div>Segunda</div>
            <div>Terça</div>
            <div>Quarta</div>
            <div>Quinta</div>
            <div>Sexta</div>
            <div>Sábado</div>
          </div>
          <div class="calendar-days">
            ${daysHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCalendarCell(dayNum, dateStr, isOtherMonth = false, isToday = false) {
  // Filtra eventos agendados para este dia
  const eventos = (DB.agendaEventos || []).filter(e => e.data === dateStr);
  const eventsHtml = eventos.map(e => `
    <div class="calendar-event-item ${e.status.toLowerCase()}" title="${e.titulo}">
      ${e.titulo}
    </div>
  `).join('');

  return `
    <div class="calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}" onclick="modalAgendaDia('${dateStr}')">
      <div class="day-number">${dayNum}</div>
      <div class="calendar-events-list">
        ${eventsHtml}
      </div>
    </div>
  `;
}

function navigateCalendar(dir) {
  if (currentCalendarMonth === null) {
    const now = new Date();
    currentCalendarMonth = now.getMonth();
    currentCalendarYear = now.getFullYear();
  }

  currentCalendarMonth += dir;
  if (currentCalendarMonth < 0) {
    currentCalendarMonth = 11;
    currentCalendarYear -= 1;
  } else if (currentCalendarMonth > 11) {
    currentCalendarMonth = 0;
    currentCalendarYear += 1;
  }
  renderPage('agenda');
}

function modalAgendaDia(dateStr) {
  // Converte data para formato legível DD/MM/AAAA
  const [y, m, d] = dateStr.split('-');
  const dateFormatted = `${d}/${m}/${y}`;
  
  const eventosDia = (DB.agendaEventos || []).filter(e => e.data === dateStr);

  let listHtml = '';
  if (eventosDia.length === 0) {
    listHtml = `<div class="empty-state" style="padding: 20px 0;"><p>Sem compromissos agendados para este dia.</p></div>`;
  } else {
    listHtml = eventosDia.map(e => `
      <div class="cal-dia-modal-item">
        <div class="cal-dia-modal-item-info">
          <div class="cal-dia-modal-item-title" style="${e.status === 'CONCLUIDO' ? 'text-decoration: line-through; color: var(--text-muted); font-style: italic;' : ''}">
            ${e.titulo}
          </div>
          ${e.descricao ? `<div class="cal-dia-modal-item-desc">${e.descricao}</div>` : ''}
          <div style="margin-top:4px">
            <span class="badge ${e.status === 'CONCLUIDO' ? 'badge-green' : 'badge-orange'}">${e.status}</span>
          </div>
        </div>
        <div class="cal-dia-modal-item-actions">
          <button class="btn-icon" onclick="toggleEventoStatus(${e.id}, '${dateStr}')" title="${e.status === 'CONCLUIDO' ? 'Marcar como Pendente' : 'Marcar como Concluído'}">
            ${e.status === 'CONCLUIDO' ? '🔄' : '✅'}
          </button>
          <button class="btn-icon" onclick="modalNovoEvento('${dateStr}', ${e.id})" title="Editar">✏️</button>
          <button class="btn-icon" onclick="deleteEvento(${e.id}, '${dateStr}')" title="Excluir">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  openModal(`Compromissos — ${dateFormatted}`, `
    <div class="cal-dia-modal-list">
      ${listHtml}
    </div>
    <div class="modal-footer" style="padding-top:12px; border-top: 1px solid var(--border)">
      <button class="btn-secondary" onclick="closeModal()">Fechar</button>
      <button class="btn-primary" onclick="modalNovoEvento('${dateStr}')">➕ Novo Compromisso</button>
    </div>
  `);
}

function modalNovoEvento(dateStr, eventId = null) {
  const ev = eventId ? DB.agendaEventos.find(e => e.id === eventId) : null;
  const titulo = ev ? ev.titulo : '';
  const desc = ev ? ev.descricao || '' : '';
  const status = ev ? ev.status : 'PENDENTE';
  const data = ev ? ev.data : dateStr;

  // Renderiza sub-modal ou modal
  openModal(ev ? 'Editar Compromisso' : 'Novo Compromisso', `
    <div class="form-group">
      <label>Título *</label>
      <input id="evTitulo" value="${titulo}" placeholder="Ex: Pagar guia do Simples..." />
    </div>
    <div class="form-group">
      <label>Descrição</label>
      <textarea id="evDesc" rows="3" placeholder="Detalhes opcionais...">${desc}</textarea>
    </div>
    <div class="form-group">
      <label>Data</label>
      <input type="date" id="evData" value="${data}" />
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="evStatus">
        <option value="PENDENTE" ${status === 'PENDENTE' ? 'selected' : ''}>PENDENTE</option>
        <option value="CONCLUIDO" ${status === 'CONCLUIDO' ? 'selected' : ''}>CONCLUÍDO</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="modalAgendaDia('${dateStr}')">Voltar</button>
      <button class="btn-primary" onclick="salvarEvento('${dateStr}', ${eventId})">💾 Salvar</button>
    </div>
  `);
}

function salvarEvento(originalDateStr, eventId) {
  const titulo = document.getElementById('evTitulo').value.trim();
  const desc = document.getElementById('evDesc').value.trim();
  const data = document.getElementById('evData').value;
  const status = document.getElementById('evStatus').value;

  if (!titulo) {
    showToast('Título é obrigatório', 'error');
    return;
  }
  if (!data) {
    showToast('Data é obrigatória', 'error');
    return;
  }

  if (!DB.agendaEventos) DB.agendaEventos = [];

  if (eventId) {
    // Editar
    const ev = DB.agendaEventos.find(e => e.id === eventId);
    if (ev) {
      ev.titulo = titulo;
      ev.descricao = desc;
      ev.data = data;
      ev.status = status;
    }
  } else {
    // Novo
    DB.agendaEventos.push({
      id: nextId('agendaEventos'),
      titulo,
      descricao: desc,
      data,
      status,
      criado: new Date().toISOString()
    });
  }

  saveDB(DB);
  showToast('Compromisso salvo com sucesso!');
  
  // Reabre o modal do dia para mostrar as alterações
  modalAgendaDia(originalDateStr === data ? originalDateStr : data);
  
  // Se estiver visualizando a agenda, renderiza a página de fundo
  if (typeof currentPage !== 'undefined' && currentPage === 'agenda') {
    renderPage('agenda');
  }
}

function deleteEvento(id, dateStr) {
  confirm_action('Excluir este compromisso?', () => {
    DB.agendaEventos = DB.agendaEventos.filter(e => e.id !== id);
    saveDB(DB);
    showToast('Compromisso excluído.', 'warning');
    modalAgendaDia(dateStr);
    
    if (typeof currentPage !== 'undefined' && currentPage === 'agenda') {
      renderPage('agenda');
    }
  });
}

function toggleEventoStatus(id, dateStr) {
  const ev = DB.agendaEventos.find(e => e.id === id);
  if (ev) {
    ev.status = ev.status === 'CONCLUIDO' ? 'PENDENTE' : 'CONCLUIDO';
    saveDB(DB);
    showToast(ev.status === 'CONCLUIDO' ? 'Compromisso concluído!' : 'Compromisso reaberto.');
    modalAgendaDia(dateStr);
    
    if (typeof currentPage !== 'undefined' && currentPage === 'agenda') {
      renderPage('agenda');
    }
  }
}

function modalEditarSemana() {
  const semId = parseInt(document.getElementById('pontoSemana')?.value);
  if (!semId) { showToast('Selecione uma semana primeiro', 'warning'); return; }
  const sem = DB.semanaPagamento.find(s => s.id === semId);
  if (!sem) { showToast('Semana não encontrada', 'error'); return; }

  openModal('Editar Período da Semana', `
    <div class="info-box" style="margin-bottom: 16px;">
      📅 <strong>Semana ${sem.numero}</strong> — Período de referência para o cartão de ponto.
    </div>
    <div class="form-group">
      <label>Data de Início *</label>
      <input type="date" id="editSemDataInicio" value="${sem.dataInicio}" />
    </div>
    <div class="form-group">
      <label>Data de Fim *</label>
      <input type="date" id="editSemDataFim" value="${sem.dataFim}" />
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarPeriodoSemana(${semId})">💾 Salvar Alterações</button>
    </div>
  `);
}

function salvarPeriodoSemana(semId) {
  const dataInicio = document.getElementById('editSemDataInicio').value;
  const dataFim = document.getElementById('editSemDataFim').value;

  if (!dataInicio || !dataFim) {
    showToast('Ambas as datas são obrigatórias', 'error');
    return;
  }

  if (new Date(dataInicio) > new Date(dataFim)) {
    showToast('A data de início não pode ser posterior à data de fim', 'error');
    return;
  }

  const sem = DB.semanaPagamento.find(s => s.id === semId);
  if (sem) {
    sem.dataInicio = dataInicio;
    sem.dataFim = dataFim;
    
    saveDB(DB);
    closeModal();
    showToast('Período da semana atualizado com sucesso!');
    
    // Recarrega a página de ponto para atualizar o select e recriar o calendário de dias
    renderPage('ponto');
    
    // Seleciona a mesma semana no select
    const select = document.getElementById('pontoSemana');
    if (select) {
      select.value = semId;
      renderPontoCalendar();
    }
  }
}


