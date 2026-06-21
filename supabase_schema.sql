-- ============================================================
-- GILSON PASSOS CONSTRUTORA — Schema do Supabase
-- Copie e cole este script no "SQL Editor" do seu painel do Supabase.
-- ============================================================

-- Tabela de Sequências para controle de IDs auto-incremento local-first
CREATE TABLE IF NOT EXISTS "sistema_sequencias" (
  "chave" text PRIMARY KEY,
  "valor" bigint NOT NULL
);

-- Obras / Projetos
CREATE TABLE IF NOT EXISTS "obras" (
  "id" bigint PRIMARY KEY,
  "codigo" text,
  "nome" text NOT NULL,
  "cliente" text,
  "endereco" text,
  "valorContrato" bigint,
  "status" text,
  "dataInicio" text,
  "dataPrevista" text,
  "observacoes" text
);

-- Bancos
CREATE TABLE IF NOT EXISTS "bancos" (
  "id" bigint PRIMARY KEY,
  "entidadeId" bigint,
  "nomeBanco" text NOT NULL,
  "agencia" text,
  "conta" text,
  "saldoInicial" bigint,
  "ativo" boolean DEFAULT true
);

-- Recebimentos
CREATE TABLE IF NOT EXISTS "recebimentos" (
  "id" bigint PRIMARY KEY,
  "obraId" bigint REFERENCES "obras"("id") ON DELETE SET NULL,
  "entidadeId" bigint,
  "bancoId" bigint REFERENCES "bancos"("id") ON DELETE SET NULL,
  "valor" bigint NOT NULL,
  "data" text,
  "origem" text,
  "descricao" text,
  "mesRef" integer,
  "anoRef" integer,
  "criado" text
);

-- Caixa Movimentos
CREATE TABLE IF NOT EXISTS "caixaMovimentos" (
  "id" bigint PRIMARY KEY,
  "tipo" text,
  "valor" bigint NOT NULL,
  "obraId" bigint REFERENCES "obras"("id") ON DELETE SET NULL,
  "descricao" text,
  "data" text,
  "entidadeDestino" bigint,
  "bancoDestino" bigint REFERENCES "bancos"("id") ON DELETE SET NULL,
  "criado" text
);

-- Funcionarios
CREATE TABLE IF NOT EXISTS "funcionarios" (
  "id" bigint PRIMARY KEY,
  "nome" text NOT NULL,
  "cpf" text,
  "telefone" text,
  "tipo" text,
  "valorDiaria" bigint,
  "ativo" boolean DEFAULT true
);

-- Semana Pagamento
CREATE TABLE IF NOT EXISTS "semanaPagamento" (
  "id" bigint PRIMARY KEY,
  "ano" integer,
  "mes" integer,
  "numero" integer,
  "dataInicio" text,
  "dataFim" text,
  "status" text
);

-- Registros Ponto
CREATE TABLE IF NOT EXISTS "registrosPonto" (
  "id" bigint PRIMARY KEY,
  "funcionarioId" bigint REFERENCES "funcionarios"("id") ON DELETE CASCADE,
  "semanaId" bigint REFERENCES "semanaPagamento"("id") ON DELETE CASCADE,
  "obraId" bigint REFERENCES "obras"("id") ON DELETE SET NULL,
  "dataTrabalho" text,
  "valorDiaria" bigint,
  "criado" text
);

-- Empreitadas
CREATE TABLE IF NOT EXISTS "empreitadas" (
  "id" bigint PRIMARY KEY,
  "funcionarioId" bigint REFERENCES "funcionarios"("id") ON DELETE CASCADE,
  "semanaId" bigint REFERENCES "semanaPagamento"("id") ON DELETE CASCADE,
  "obraId" bigint REFERENCES "obras"("id") ON DELETE SET NULL,
  "descricao" text,
  "valorTotal" bigint,
  "criado" text
);

-- Pagamentos
CREATE TABLE IF NOT EXISTS "pagamentos" (
  "id" bigint PRIMARY KEY,
  "funcionarioId" bigint REFERENCES "funcionarios"("id") ON DELETE CASCADE,
  "semanaId" bigint REFERENCES "semanaPagamento"("id") ON DELETE CASCADE,
  "valorCalculado" bigint,
  "valorPago" bigint,
  "formaPagamento" text,
  "bancoId" bigint REFERENCES "bancos"("id") ON DELETE SET NULL,
  "dataPagamento" text,
  "status" text,
  "observacao" text,
  "criado" text
);

-- Despesas
CREATE TABLE IF NOT EXISTS "despesas" (
  "id" bigint PRIMARY KEY,
  "bancoId" bigint REFERENCES "bancos"("id") ON DELETE SET NULL,
  "obraId" bigint REFERENCES "obras"("id") ON DELETE SET NULL,
  "categoria" text,
  "descricao" text,
  "valor" bigint,
  "data" text,
  "criado" text
);

-- Gastos Pessoais
CREATE TABLE IF NOT EXISTS "gastosPessoais" (
  "id" bigint PRIMARY KEY,
  "tipo" text,
  "descricao" text,
  "valor" bigint,
  "data" text,
  "mesRef" integer,
  "anoRef" integer,
  "criado" text
);

-- Orcamento Mensal
CREATE TABLE IF NOT EXISTS "orcamentoMensal" (
  "id" bigint PRIMARY KEY,
  "mes" integer,
  "ano" integer,
  "rendaPrevista" bigint
);

-- Checklist Topicos
CREATE TABLE IF NOT EXISTS "checklistTopicos" (
  "id" bigint PRIMARY KEY,
  "obraId" bigint REFERENCES "obras"("id") ON DELETE CASCADE,
  "semana" text,
  "nome" text,
  "criadoEm" text
);

-- Checklist Tarefas
CREATE TABLE IF NOT EXISTS "checklistTarefas" (
  "id" bigint PRIMARY KEY,
  "topicoId" bigint REFERENCES "checklistTopicos"("id") ON DELETE CASCADE,
  "obraId" bigint REFERENCES "obras"("id") ON DELETE CASCADE,
  "semana" text,
  "texto" text,
  "concluida" boolean DEFAULT false,
  "criadoEm" text
);
