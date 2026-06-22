# GILSON PASSOS CONSTRUTORA — Sistema Financeiro

Sistema Web de Controle Financeiro e Operacional com sincronização em nuvem e persistência local-first.

## Funcionalidades

### Módulo Empresarial
- **Dashboard**: Gráficos e indicadores financeiros em tempo real.
- **Gestão de Obras / Projetos**: Cadastro e acompanhamento de contratos.
- **Recebimentos**: Controle detalhado por entidade (MEI, PF, Espécie).
- **Limites Fiscais**: MEI (R$ 81k/ano) e PF (R$ 5k/mês) com alertas automáticos.
- **Caixa em Espécie**: Lançamento de movimentações e depósitos bancários.
- **Bancos**: Gestão de contas e saldos vinculados a cada entidade.
- **Cartão de Ponto**: Controle de diárias de funcionários.
- **Folha Semanal**: Cálculo automático e controle de pagamentos.
- **Despesas**: Registro categorizado de gastos corporativos.
- **Checklist Semanal**: Lista de verificação e controle por obra.

### Módulo Pessoal
- **Dashboard Casa**: Saúde financeira familiar.
- **Gastos Fixos & Variáveis**: Lançamento categorizado de despesas.
- **Orçamento Mensal**: Controle de metas e limite de gastos.

---

## ⚡ Sincronização em Nuvem (Supabase)

O sistema foi preparado com uma integração segura e automática:
- **Sem configurações manuais**: A conexão é automática e transparente para o usuário final.
- **Persistência Local-First**: O sistema funciona offline salvando no navegador e sincroniza com a nuvem automaticamente quando há internet.
- **Sincronização em Segundo Plano**: Salvamentos locais disparam uma atualização silenciosa na nuvem após 2 segundos de inatividade.
- **Recuperação de Dados**: Ao fazer login em qualquer dispositivo, os dados são recuperados automaticamente da nuvem.

---

## 🚀 Como fazer Deploy na Vercel

Siga o passo a passo para colocar o site online gratuitamente na Vercel:

1. **Crie uma conta na Vercel**:
   Acesse [vercel.com](https://vercel.com) e conecte com seu GitHub, GitLab ou crie uma conta usando e-mail.

2. **Crie um novo projeto**:
   - Clique em **Add New...** -> **Project**.
   - Importe o repositório git do projeto.

3. **Configure o Diretório Raiz (Root Directory)**:
   - Como os arquivos do sistema estão dentro da pasta `GILSONPASSOSCONSTRUTORA`, nas configurações de importação da Vercel clique em **Edit** ao lado de **Root Directory**.
   - Selecione a pasta `GILSONPASSOSCONSTRUTORA`.

4. **Deploy**:
   - O comando de build (`npm run build`) e a pasta de saída serão detectados automaticamente e executados com sucesso.
   - Clique em **Deploy** e seu site estará online com domínio próprio e SSL gratuito em menos de 1 minuto!

---

## 📦 Estrutura do Projeto

- `index.html`: Interface visual do sistema.
- `style.css`: Estilização e tema escuro construtora.
- `app.js`: Lógica de negócios e gerenciamento da interface.
- `supabase.js`: SDK de integração automática com o Supabase.
- `vercel.json`: Arquivo de configuração de rotas e URLs limpas da Vercel.
- `supabase_schema.sql`: Script SQL para inicialização das tabelas no painel do Supabase.
