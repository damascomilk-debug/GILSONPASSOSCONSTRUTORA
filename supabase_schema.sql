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

-- ============================================================
-- Políticas de Segurança (Row Level Security - RLS)
-- Habilita o RLS e define as políticas de acesso autenticado
-- ============================================================

ALTER TABLE "sistema_sequencias" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "sistema_sequencias";
CREATE POLICY "Permitir tudo para autenticados" ON "sistema_sequencias" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "obras" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "obras";
CREATE POLICY "Permitir tudo para autenticados" ON "obras" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "bancos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "bancos";
CREATE POLICY "Permitir tudo para autenticados" ON "bancos" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "recebimentos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "recebimentos";
CREATE POLICY "Permitir tudo para autenticados" ON "recebimentos" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "caixaMovimentos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "caixaMovimentos";
CREATE POLICY "Permitir tudo para autenticados" ON "caixaMovimentos" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "funcionarios" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "funcionarios";
CREATE POLICY "Permitir tudo para autenticados" ON "funcionarios" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "semanaPagamento" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "semanaPagamento";
CREATE POLICY "Permitir tudo para autenticados" ON "semanaPagamento" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "registrosPonto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "registrosPonto";
CREATE POLICY "Permitir tudo para autenticados" ON "registrosPonto" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "empreitadas" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "empreitadas";
CREATE POLICY "Permitir tudo para autenticados" ON "empreitadas" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "pagamentos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "pagamentos";
CREATE POLICY "Permitir tudo para autenticados" ON "pagamentos" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "despesas" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "despesas";
CREATE POLICY "Permitir tudo para autenticados" ON "despesas" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "gastosPessoais" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "gastosPessoais";
CREATE POLICY "Permitir tudo para autenticados" ON "gastosPessoais" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "orcamentoMensal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "orcamentoMensal";
CREATE POLICY "Permitir tudo para autenticados" ON "orcamentoMensal" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "checklistTopicos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "checklistTopicos";
CREATE POLICY "Permitir tudo para autenticados" ON "checklistTopicos" FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "checklistTarefas" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON "checklistTarefas";
CREATE POLICY "Permitir tudo para autenticados" ON "checklistTarefas" FOR ALL TO authenticated USING (true) WITH CHECK (true);
