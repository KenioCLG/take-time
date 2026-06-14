# Take Time — Feature Planner
> Atualizado: 2026-06-14

---

## FASE 1 — Correções e Polimento (Prioridade Alta)
> Itens que afetam uso diário. Devem ser feitos primeiro.

### 1.1 Checklist no popup da pizza para TODOS os tipos
- **Hoje**: Só `study` mostra checklist no popup da pizza
- **Meta**: `training` mostra exercícios com check, `inactive/routine` mostra checklist
- **Arquivo**: `app.js` linhas 1246-1248 (onde tem `checklistContainer.classList.add('hidden')`)
- **Esforço**: Pequeno — já existe lógica similar no blockList (linhas 693-740)

### 1.2 Agrupamento visual por matéria nos assuntos
- **Hoje**: Lista flat de assuntos no syllabus, campo `materia` existe mas não agrupa
- **Meta**: Assuntos agrupados por matéria com headers colapsáveis
- **Arquivos**: `app.js` (renderProfileContent), `index.html` (profileContentList)
- **Esforço**: Médio

### 1.3 Agrupamento por matéria no popup da pizza
- **Hoje**: Checklist flat no popup
- **Meta**: Assuntos agrupados por matéria com sub-headers dentro do popup
- **Arquivo**: `app.js` linhas 1197-1208
- **Esforço**: Pequeno (depois que 1.2 estiver pronto)

### 1.4 Agrupamento por matéria no select do blockList
- **Hoje**: Dropdown flat `<select>` com todos os assuntos
- **Meta**: `<optgroup>` por matéria no select
- **Arquivo**: `app.js` linhas 666-671
- **Esforço**: Pequeno

---

## FASE 2 — Notas Datadas e Integração (Prioridade Média)
> Tornar notas parte do fluxo diário.

### 2.1 Notas datadas (vincular nota a uma data)
- **Hoje**: Notas têm título, conteúdo, tags, updatedAt
- **Meta**: Campo `date` opcional. Notas com data aparecem ao lado das atividades do dia
- **Arquivos**: `app.js` (renderNotes, openNoteModal, saveNote), `auth.js` (notes table)
- **Supabase**: Adicionar coluna `date` na tabela `notes`
- **Esforço**: Médio

### 2.2 Notas visíveis na aba Agenda
- **Hoje**: Notas só aparecem na aba Notas
- **Meta**: Notas do dia selecionado aparecem abaixo do blockList
- **Arquivo**: `app.js` (renderBlockList)
- **Esforço**: Médio (depende de 2.1)

### 2.3 Editor de notas melhorado
- **Hoje**: Textarea simples
- **Meta**: Editor com formatação básica (negrito, itálico, listas, headings)
- **Opções**: Markdown preview ou toolbar WYSIWYG leve
- **Esforço**: Grande

---

## FASE 3 — Cronograma Visual (Prioridade Média)
> Visão de planejamento semanal/mensal.

### 3.1 Visão semanal em grade
- **Hoje**: Só vê um dia por vez na pizza
- **Meta**: Grid com dias da semana mostrando blocos como barras coloridas
- **Arquivo**: Nova seção/tab ou modal
- **Esforço**: Grande

### 3.2 Visão mensal de progresso
- **Hoje**: Não existe
- **Meta**: Calendário mensal com indicadores de conclusão por dia (heatmap)
- **Esforço**: Grande

### 3.3 Estatísticas de estudo
- **Hoje**: Logs básicos
- **Meta**: Dashboard com horas estudadas por matéria, streak, tendências
- **Esforço**: Grande

---

## FASE 4 — Melhorias de UX (Prioridade Baixa)
> Quality of life para uso avançado.

### 4.1 Remover "repetir diariamente" e usar dias da semana
- **Hoje**: Toggle "repetir diariamente" no modal de bloco
- **Meta**: Multi-select de dias da semana (Seg, Ter, Qua...) ao invés de boolean
- **Arquivos**: `app.js` (openBlockModal, saveBlock), `index.html` (modal), `auth.js` (blocks table)
- **Supabase**: Alterar coluna `repeat_daily` para `repeat_days` (array ou bitmask)
- **Esforço**: Médio

### 4.2 Drag-and-drop para reordenar blocos na pizza
- **Hoje**: Blocos fixos por horário
- **Meta**: Arrastar fatias para trocar horários
- **Esforço**: Grande

### 4.3 Templates de dia
- **Hoje**: Criar blocos manualmente
- **Meta**: Salvar configuração de um dia como template e aplicar em outros dias
- **Esforço**: Médio

### 4.4 Compartilhamento de cronograma
- **Hoje**: Dados privados
- **Meta**: Gerar link público de visualização (read-only)
- **Esforço**: Grande (requer backend)

---

## Ordem de Execução Recomendada

```
FASE 1 (agora)
  1.1 Checklist pizza todos os tipos
  1.2 Agrupamento por matéria (lista)
  1.3 Agrupamento por matéria (popup pizza)
  1.4 Agrupamento por matéria (select blockList)

FASE 2 (próxima)
  2.1 Notas datadas
  2.2 Notas na aba Agenda
  2.3 Editor melhorado

FASE 3 (depois)
  3.1 Visão semanal
  3.2 Visão mensal
  3.3 Estatísticas

FASE 4 (futuro)
  4.1 Dias da semana
  4.2 Drag-and-drop
  4.3 Templates
  4.4 Compartilhamento
```

---

## Notas Técnicas

- **Deploy**: `git push origin master` + `npx vercel --prod --yes` (auto-deploy quebrado)
- **Cache**: Sempre bumpar juntos: `CACHE` em sw.js, `tt_cache_v` em index.html, `?v=` nos scripts
- **Supabase**: Projeto `zkzhqgbhxhkwpgevddot`, usar UPSERT (POST + resolution=merge-duplicates)
- **i18n**: Toda string visível precisa de chave em `locales/pt-BR.json` e `locales/en-US.json`
- **DS**: Usar componentes do design system (ds.css) — sheet, toast, confirm, icon
