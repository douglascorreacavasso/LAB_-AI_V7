// =============================================================================
// ENGINE_EXPORT_ANALYSIS.JS — Lab v7 - Raciocínio
//
// EXPORTA RELATÓRIO HTML INTERATIVO da rede atual.
//
// CONTEÚDO:
//   1. Header com stats gerais
//   2. Painel de rules aprendidas (com fórmula, usos, exemplos)
//   3. Concepts aprendidos do user (origem orgânica)
//   4. Dossiês de cada sujeito (incluindo Self)
//   5. Cadeias lógicas (com replay turno-a-turno)
//   6. Contradições detectadas (resolvidas + pendentes)
//   7. Hipóteses pendentes/confirmadas
//   8. Provisionais (aguardando/promovidas/descartadas)
//   9. Meditações executadas (histórico)
//   10. Distribuição de tipos de nó
//
// SELF-CONTAINED: CSS embutido, sem links externos.
// SAÍDA: arquivo HTML salvo via blob download.
// =============================================================================

'use strict';

function exportAnalysisHTML(){
  const html = _buildHTML();
  const blob = new Blob([html], {type: 'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lab_v${LAB_VERSION}_ANALISE_${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.html`;
  a.click();
  URL.revokeObjectURL(url);
  console.log('[analysis] exportado');
}

// ============================================================
// BUILD HTML
// ============================================================
function _buildHTML(){
  const stats = _computeStats();
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Lab v${LAB_VERSION} — Análise (${stats.sessao})</title>
<style>${_css()}</style>
</head>
<body>
<div class="container">
  ${_renderHeader(stats)}
  ${_renderRules(stats)}
  ${_renderConcepts(stats)}
  ${_renderDossies()}
  ${_renderCadeias()}
  ${_renderContradicoes()}
  ${_renderHipoteses()}
  ${_renderProvisionais()}
  ${_renderMeditacoes()}
  ${_renderTipos(stats)}
  <footer>
    <p>gerado em ${new Date().toLocaleString('pt-BR')} · Lab v${LAB_VERSION}</p>
  </footer>
</div>
<script>${_inlineScript()}</script>
</body>
</html>`;
}

// ============================================================
// STATS
// ============================================================
function _computeStats(){
  const tipos = {};
  for(const n of STATE.nodes) tipos[n.type] = (tipos[n.type] || 0) + 1;

  return {
    sessao:           STATE.session_atual || '?',
    turnos:           STATE.iterations.length,
    nodes:            STATE.nodes.length,
    edges:            STATE.edges.length,
    super:            STATE.nodes.filter(n => n.is_super).length,
    sujeitos:         Object.keys(STATE.dossiers || {}),
    cadeias:          STATE.logic_chains.length,
    cadeias_boas:     STATE.logic_chains.filter(c => c.marcada === 'boa').length,
    cadeias_ruins:    STATE.logic_chains.filter(c => c.marcada === 'ruim').length,
    rules:            STATE.nodes.filter(n => n.type === 'rule_math'),
    concepts_user:    STATE.nodes.filter(n => n._origem_user),
    contradicoes:     STATE.contradicoes || [],
    hipoteses:        STATE.nodes.filter(n => n.type === 'hypothesis'),
    provisionais:     STATE.nodes.filter(n => n.type === 'provisional'),
    meditacoes:       STATE.meditacoes || [],
    tipos,
  };
}

// ============================================================
// HEADER
// ============================================================
function _renderHeader(s){
  return `
  <header>
    <h1>Lab v${LAB_VERSION} — Relatório de Análise</h1>
    <div class="subtitle">sessão <code>${s.sessao.slice(-12)}</code> · ${s.turnos} turnos</div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-num">${s.nodes}</div><div class="kpi-label">nós</div></div>
      <div class="kpi"><div class="kpi-num">${s.edges}</div><div class="kpi-label">arestas</div></div>
      <div class="kpi"><div class="kpi-num">${s.super}</div><div class="kpi-label">super-núcleos</div></div>
      <div class="kpi accent"><div class="kpi-num">${s.rules.length}</div><div class="kpi-label">rules aprendidas</div></div>
      <div class="kpi accent"><div class="kpi-num">${s.concepts_user.length}</div><div class="kpi-label">concepts user</div></div>
      <div class="kpi"><div class="kpi-num">${s.cadeias}</div><div class="kpi-label">cadeias</div></div>
      <div class="kpi positive"><div class="kpi-num">${s.cadeias_boas}</div><div class="kpi-label">cadeias ✓</div></div>
      <div class="kpi negative"><div class="kpi-num">${s.cadeias_ruins}</div><div class="kpi-label">cadeias ✗</div></div>
    </div>
  </header>`;
}

// ============================================================
// RULES
// ============================================================
function _renderRules(s){
  if(s.rules.length === 0){
    return _section('🧮 Rules Aprendidas', '<p class="empty">nenhuma rule inferida ainda — ensine padrões matemáticos pra ver aqui</p>');
  }
  const items = s.rules.map(r => `
    <div class="card highlight">
      <div class="card-title">${_escape(r.text)}</div>
      <div class="card-meta">id: <code>${r.id}</code> · usos: ${r._n_usos || 0} · exemplos: ${r._n_exemplos || 0}</div>
      <div class="card-meta">origem: ${r._origem || 'inferida'} · operador: <code>${r._operador}</code> · fórmula: <code>${r._formula}</code></div>
    </div>
  `).join('');
  return _section('🧮 Rules Aprendidas', items);
}

// ============================================================
// CONCEPTS APRENDIDOS DO USER
// ============================================================
function _renderConcepts(s){
  if(s.concepts_user.length === 0){
    return _section('🌱 Concepts Aprendidos', '<p class="empty">nenhum concept aprendido do user</p>');
  }
  const items = s.concepts_user.map(c => `
    <div class="card">
      <div class="card-title">${_escape(c.text)}</div>
      <div class="card-meta">id: <code>${c.id}</code> · turno criado: ${c._criado_turno || '?'} · mass: ${(c.mass||0).toFixed(1)}</div>
    </div>
  `).join('');
  return _section('🌱 Concepts Aprendidos do User', items);
}

// ============================================================
// DOSSIÊS
// ============================================================
function _renderDossies(){
  const html = [];

  // Self
  if(Object.keys(STATE.selfDossier || {}).length > 0){
    html.push(`<div class="card highlight">
      <div class="card-title">📍 Self (NEREL)</div>
      <pre>${_escape(JSON.stringify(STATE.selfDossier, null, 2))}</pre>
    </div>`);
  }

  // Users
  for(const suj of Object.keys(STATE.dossiers || {})){
    html.push(`<div class="card">
      <div class="card-title">👤 ${_escape(suj)}</div>
      <pre>${_escape(JSON.stringify(STATE.dossiers[suj], null, 2))}</pre>
    </div>`);
  }

  if(html.length === 0){
    return _section('📋 Dossiês', '<p class="empty">nenhum dossiê preenchido</p>');
  }
  return _section('📋 Dossiês', html.join(''));
}

// ============================================================
// CADEIAS LÓGICAS
// ============================================================
function _renderCadeias(){
  const chains = STATE.logic_chains || [];
  if(chains.length === 0){
    return _section('🔗 Cadeias Lógicas', '<p class="empty">nenhuma cadeia ainda</p>');
  }

  // Pega últimas 25 cadeias (do mais recente pro mais antigo)
  const lim = chains.slice(-25).reverse();

  const items = lim.map(c => {
    const marker = c.marcada === 'boa' ? '✅' : (c.marcada === 'ruim' ? '❌' : '◯');
    const turno = STATE.iterations.find(i => i.logic_chain_id === c.id);
    const entrada = turno?.entrada || '(sem registro)';
    const resposta = turno?.resposta || '(sem resposta)';
    const acoes = (c.acoes || []).join(', ') || '—';
    return `
    <div class="chain ${c.marcada || ''}" data-chain-id="${c.id}">
      <div class="chain-head" onclick="toggleChain(this)">
        <span class="chain-marker">${marker}</span>
        <span class="chain-turn">turno ${c.turno}</span>
        <span class="chain-modo">[${c.modo || c.tipo || '?'}]</span>
        <span class="chain-acoes">${acoes}</span>
      </div>
      <div class="chain-body">
        <div><strong>entrada:</strong> ${_escape(entrada)}</div>
        <div><strong>resposta:</strong> ${_escape(resposta)}</div>
        <div><strong>sujeito:</strong> ${c.sujeito || '—'}</div>
        <div><strong>cadeia:</strong> <code>${(c.sequencia || []).join(' → ')}</code></div>
      </div>
    </div>`;
  }).join('');

  return _section(`🔗 Cadeias Lógicas (últimas ${lim.length} de ${chains.length})`, items);
}

// ============================================================
// CONTRADIÇÕES
// ============================================================
function _renderContradicoes(){
  const cs = STATE.contradicoes || [];
  if(cs.length === 0){
    return _section('⚖ Contradições', '<p class="empty">nenhuma contradição detectada</p>');
  }
  const items = cs.map(c => `
    <div class="card ${c.status === 'pendente' ? 'warning' : ''}">
      <div class="card-title">${c.severidade.toUpperCase()} · ${c.status} · turno ${c.turno}</div>
      <div class="card-meta">${_escape(c.descricao)}</div>
      <div class="card-meta">A: ${_escape(c.texto_a || '?')}</div>
      <div class="card-meta">B: ${_escape(c.texto_b || '?')}</div>
      ${c.resolucao ? `<div class="card-meta">resolução: ${_escape(JSON.stringify(c.resolucao))}</div>` : ''}
    </div>
  `).join('');
  return _section('⚖ Contradições', items);
}

// ============================================================
// HIPÓTESES
// ============================================================
function _renderHipoteses(){
  const hs = STATE.nodes.filter(n => n.type === 'hypothesis');
  if(hs.length === 0){
    return _section('💭 Hipóteses', '<p class="empty">nenhuma hipótese</p>');
  }
  const items = hs.map(h => `
    <div class="card ${h._status === 'pendente' ? 'warning' : (h._status === 'confirmada' ? 'positive' : 'negative')}">
      <div class="card-title">${_escape(h._afirma || h.text)}</div>
      <div class="card-meta">status: ${h._status} · confidence: ${((h._confidence||0)*100).toFixed(0)}% · turno: ${h._turno_criada || '?'}</div>
    </div>
  `).join('');
  return _section('💭 Hipóteses', items);
}

// ============================================================
// PROVISIONAIS
// ============================================================
function _renderProvisionais(){
  const ps = STATE.nodes.filter(n => n.type === 'provisional');
  if(ps.length === 0){
    return _section('🏷 Provisionais', '<p class="empty">nenhuma provisional</p>');
  }
  const items = ps.map(p => `
    <div class="card ${p._status === 'promovida' ? 'positive' : (p._status === 'descartada' ? 'negative' : 'warning')}">
      <div class="card-title">${_escape(p._categoria_alvo || p.text)}</div>
      <div class="card-meta">status: ${p._status} · turno: ${p._turno_criada || '?'}</div>
      ${p._promovida_para ? `<div class="card-meta">→ promovida para <code>${p._promovida_para}</code></div>` : ''}
    </div>
  `).join('');
  return _section('🏷 Etiquetas Provisórias', items);
}

// ============================================================
// MEDITAÇÕES
// ============================================================
function _renderMeditacoes(){
  const ms = STATE.meditacoes || [];
  if(ms.length === 0){
    return _section('🧘 Meditações', '<p class="empty">ainda não meditou</p>');
  }
  const items = ms.map(m => `
    <div class="card">
      <div class="card-title">turno ${m.turno} · ${m.automatica ? 'automática' : 'manual'}</div>
      <div class="card-meta">desc: ${m.resumo.descartadas} · fund: ${m.resumo.fundidas} · super: ${m.resumo.super_promovidos} · dec: ${m.resumo.decaidas} · contras: ${m.resumo.contras_propostas} · hipo: ${m.resumo.hipo_consolidadas} (${m.resumo.tempo_ms}ms)</div>
    </div>
  `).join('');
  return _section('🧘 Meditações', items);
}

// ============================================================
// TIPOS
// ============================================================
function _renderTipos(s){
  const total = STATE.nodes.length;
  const sorted = Object.entries(s.tipos).sort((a,b) => b[1] - a[1]);
  const items = sorted.map(([t, n]) => {
    const pct = (n / total * 100).toFixed(1);
    return `
    <div class="bar-row">
      <div class="bar-label">${_escape(t)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="bar-val">${n} <span class="bar-pct">(${pct}%)</span></div>
    </div>`;
  }).join('');
  return _section(`📦 Distribuição de Tipos (total: ${total})`, items);
}

// ============================================================
// HELPERS
// ============================================================
function _section(titulo, body){
  return `<section><h2>${titulo}</h2>${body}</section>`;
}

function _escape(s){
  if(s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// CSS INLINE (TEMA ESCURO ALINHADO COM O LAB)
// ============================================================
function _css(){
  return `
  :root {
    --bg: #0a0d10;
    --bg-soft: #14181c;
    --bg-card: #1a2026;
    --ink: #e6edf3;
    --ink-low: #8f9ba6;
    --accent: #5eead4;
    --warn: #fbbf24;
    --danger: #ef4444;
    --positive: #22c55e;
    --negative: #ef4444;
    --border: #2b3340;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--ink); font-family: ui-monospace, monospace; line-height: 1.5; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  header { padding: 24px 0; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
  h1 { font-size: 28px; color: var(--accent); }
  .subtitle { color: var(--ink-low); margin-top: 4px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 20px; }
  .kpi { background: var(--bg-card); border: 1px solid var(--border); padding: 14px; border-radius: 6px; text-align: center; }
  .kpi-num { font-size: 24px; font-weight: 700; color: var(--ink); }
  .kpi-label { font-size: 11px; color: var(--ink-low); margin-top: 4px; }
  .kpi.accent .kpi-num { color: var(--accent); }
  .kpi.positive .kpi-num { color: var(--positive); }
  .kpi.negative .kpi-num { color: var(--negative); }
  section { margin: 32px 0; }
  section h2 { font-size: 18px; color: var(--accent); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .card { background: var(--bg-card); border: 1px solid var(--border); padding: 14px; border-radius: 6px; margin-bottom: 10px; }
  .card.highlight { border-color: var(--accent); }
  .card.warning  { border-color: var(--warn); }
  .card.positive { border-color: var(--positive); }
  .card.negative { border-color: var(--negative); }
  .card-title { font-weight: 600; color: var(--ink); margin-bottom: 4px; }
  .card-meta  { font-size: 12px; color: var(--ink-low); margin-top: 2px; }
  pre { background: var(--bg); padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; color: var(--ink); margin-top: 8px; }
  code { background: var(--bg); padding: 1px 5px; border-radius: 3px; font-size: 12px; color: var(--accent); }
  p.empty { color: var(--ink-low); font-style: italic; padding: 8px 0; }
  .chain { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; overflow: hidden; }
  .chain.boa  { border-left: 3px solid var(--positive); }
  .chain.ruim { border-left: 3px solid var(--negative); }
  .chain-head { padding: 10px 14px; cursor: pointer; display: flex; gap: 12px; align-items: center; user-select: none; }
  .chain-head:hover { background: rgba(94,234,212,0.05); }
  .chain-marker { font-size: 14px; }
  .chain-turn { color: var(--accent); font-weight: 600; }
  .chain-modo { color: var(--ink-low); font-size: 11px; }
  .chain-acoes { color: var(--ink-low); font-size: 11px; margin-left: auto; }
  .chain-body { padding: 0 14px 12px 14px; font-size: 12px; color: var(--ink-low); display: none; }
  .chain.open .chain-body { display: block; }
  .chain-body div { margin-top: 4px; }
  .bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .bar-label { width: 180px; font-size: 12px; color: var(--ink-low); text-align: right; }
  .bar-track { flex: 1; background: var(--bg-card); height: 16px; border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--positive)); }
  .bar-val { width: 80px; font-size: 12px; color: var(--ink); }
  .bar-pct { color: var(--ink-low); font-size: 11px; }
  footer { margin-top: 32px; padding: 16px 0; border-top: 1px solid var(--border); color: var(--ink-low); font-size: 11px; text-align: center; }
  `;
}

function _inlineScript(){
  return `
  function toggleChain(headEl){
    headEl.parentElement.classList.toggle('open');
  }
  `;
}

// ============================================================
// EXPOR
// ============================================================
window.exportAnalysisHTML = exportAnalysisHTML;

console.log('[engine_export_analysis v7] carregado');
