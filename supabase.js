// ============================================================
// GILSON PASSOS CONSTRUTORA — Integração com o Supabase
// supabase.js — SDK Client e Lógica de Sincronização
// ============================================================

const SUPABASE_URL_KEY = 'gp_supabase_url_v1';
const SUPABASE_KEY_KEY = 'gp_supabase_key_v1';
const DB_KEY = 'gp_sistema_v1';
const AUTH_KEY = 'gp_auth_v1';

let supabaseClient = null;

const DEFAULT_SUPABASE_URL = 'https://eezudtgbfeuroodhgmtp.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlenVkdGdiZmV1cm9vZGhnbXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTQyNjYsImV4cCI6MjA5NzYzMDI2Nn0.-xeLXw4n4o6TF6FIY3ayN1ODeDV0z4d4Ag926WBHKOQ';

function getSupabaseCredentials() {
  return {
    url: DEFAULT_SUPABASE_URL,
    key: DEFAULT_SUPABASE_KEY
  };
}

function hasSupabaseConfigured() {
  return true;
}

function saveSupabaseCredentials(url, key) {
  // Desativado por segurança - a conexão é interna e administrada pelo criador
}

function initSupabase(force = false) {
  if (supabaseClient && !force) return;
  const { url, key } = getSupabaseCredentials();
  if (url && key && typeof supabase !== 'undefined') {
    try {
      supabaseClient = supabase.createClient(url, key);
    } catch (e) {
      console.error("Erro ao inicializar Supabase client:", e);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
  }
}

// Inicializa no carregamento do script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}

async function testSupabaseConnection(url, key) {
  if (!url || !key) return { success: false, message: "URL e Key são obrigatórios." };
  try {
    const tempClient = supabase.createClient(url, key);
    // Tenta selecionar um registro simples da tabela de sequências para verificar a autorização
    const { data, error } = await tempClient.from('sistema_sequencias').select('chave').limit(1);
    
    if (error) {
      // Se o erro for de tabela inexistente, a credencial é válida, mas as tabelas ainda não foram criadas
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        return { 
          success: true, 
          tablesMissing: true, 
          message: "Conectado com sucesso! Mas atenção: as tabelas do banco ainda não foram criadas. Execute o script SQL." 
        };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: "Conexão estabelecida com sucesso!" };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

async function syncToSupabase() {
  if (!supabaseClient) throw new Error("Supabase não está configurado ou inicializado.");

  // 1. Prepara dados das sequências
  const seqArray = Object.entries(DB.seq).map(([chave, valor]) => ({ chave, valor }));

  // Ordem reversa para deleção devido a chaves estrangeiras
  const tablesDeleteOrder = [
    'checklistTarefas',
    'checklistTopicos',
    'registrosPonto',
    'empreitadas',
    'pagamentos',
    'despesas',
    'caixaMovimentos',
    'recebimentos',
    'gastosPessoais',
    'orcamentoMensal',
    'bancos',
    'funcionarios',
    'semanaPagamento',
    'obras',
    'sistema_sequencias'
  ];

  // Ordem de inserção respeitando as dependências
  const tablesInsertOrder = [
    { name: 'sistema_sequencias', data: seqArray },
    { name: 'obras', data: DB.obras },
    { name: 'bancos', data: DB.bancos },
    { name: 'recebimentos', data: DB.recebimentos },
    { name: 'caixaMovimentos', data: DB.caixaMovimentos },
    { name: 'funcionarios', data: DB.funcionarios },
    { name: 'semanaPagamento', data: DB.semanaPagamento },
    { name: 'registrosPonto', data: DB.registrosPonto },
    { name: 'empreitadas', data: DB.empreitadas },
    { name: 'pagamentos', data: DB.pagamentos },
    { name: 'despesas', data: DB.despesas },
    { name: 'gastosPessoais', data: DB.gastosPessoais },
    { name: 'orcamentoMensal', data: DB.orcamentoMensal },
    { name: 'checklistTopicos', data: DB.checklistTopicos },
    { name: 'checklistTarefas', data: DB.checklistTarefas }
  ];

  // Limpa as tabelas no Supabase para garantir cópia fiel (deleta dados órfãos)
  for (const tableName of tablesDeleteOrder) {
    let query = supabaseClient.from(tableName).delete();
    if (tableName === 'sistema_sequencias') {
      query = query.neq('chave', '');
    } else {
      query = query.neq('id', 0);
    }
    const { error } = await query;
    if (error) {
      throw new Error(`Erro ao limpar tabela ${tableName}: ${error.message}`);
    }
  }

  // Faz o upload dos dados novos na ordem correta
  for (const table of tablesInsertOrder) {
    if (table.data && table.data.length > 0) {
      const { error } = await supabaseClient.from(table.name).insert(table.data);
      if (error) {
        throw new Error(`Erro ao inserir dados na tabela ${table.name}: ${error.message}`);
      }
    }
  }
}

async function syncFromSupabase() {
  if (!supabaseClient) throw new Error("Supabase não está configurado ou inicializado.");

  const tables = [
    { name: 'sistema_sequencias', prop: 'seq' },
    { name: 'obras', prop: 'obras' },
    { name: 'bancos', prop: 'bancos' },
    { name: 'recebimentos', prop: 'recebimentos' },
    { name: 'caixaMovimentos', prop: 'caixaMovimentos' },
    { name: 'funcionarios', prop: 'funcionarios' },
    { name: 'semanaPagamento', prop: 'semanaPagamento' },
    { name: 'registrosPonto', prop: 'registrosPonto' },
    { name: 'empreitadas', prop: 'empreitadas' },
    { name: 'pagamentos', prop: 'pagamentos' },
    { name: 'despesas', prop: 'despesas' },
    { name: 'gastosPessoais', prop: 'gastosPessoais' },
    { name: 'orcamentoMensal', prop: 'orcamentoMensal' },
    { name: 'checklistTopicos', prop: 'checklistTopicos' },
    { name: 'checklistTarefas', prop: 'checklistTarefas' }
  ];

  const newDB = {
    entidades: DB.entidades, // Mantém entidades pré-cadastradas estáticas do sistema
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
    gastosPessoais: [],
    orcamentoMensal: [],
    checklistTopicos: [],
    checklistTarefas: [],
    seq: { 
      bancos: 1, obras: 1, recebimentos: 1, caixaMovimentos: 1, funcionarios: 1, 
      semanaPagamento: 1, registrosPonto: 1, empreitadas: 1, pagamentos: 1, 
      despesas: 1, gastosPessoais: 1, orcamentoMensal: 1, checklistTopicos: 1, checklistTarefas: 1 
    }
  };

  for (const table of tables) {
    const { data, error } = await supabaseClient.from(table.name).select('*');
    if (error) {
      throw new Error(`Erro ao carregar tabela ${table.name}: ${error.message}`);
    }

    if (table.prop === 'seq') {
      if (data && data.length > 0) {
        data.forEach(item => {
          newDB.seq[item.chave] = parseInt(item.valor);
        });
      }
    } else {
      newDB[table.prop] = data || [];
    }
  }

  // Se o banco remoto estiver totalmente vazio, mas o local tiver dados, faz o upload em vez de sobrescrever
  const localHasData = (DB.obras && DB.obras.length > 0) || (DB.bancos && DB.bancos.length > 0) || (DB.recebimentos && DB.recebimentos.length > 0) || (DB.funcionarios && DB.funcionarios.length > 0);
  const remoteHasData = newDB.obras.length > 0 || newDB.bancos.length > 0 || newDB.recebimentos.length > 0 || newDB.funcionarios.length > 0;
  
  if (localHasData && !remoteHasData) {
    console.log("Banco remoto vazio. Sincronizando dados locais para a nuvem...");
    await syncToSupabase();
    return;
  }

  // Sobrescreve banco de dados local
  localStorage.setItem(DB_KEY, JSON.stringify(newDB));
  DB = newDB;
}
