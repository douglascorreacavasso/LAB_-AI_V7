// =============================================================================
// UI_LOG.JS — Lab v7 - Raciocínio
//
// Painel do meio: mostra iteração-por-iteração do motor.
//
// Cada turno vira uma caixa com:
//   - header: turno N · entrada · tempo total
//   - linhas: uma por iteração, com tag colorida (create/pulse/infer/action/warn)
//
// Tudo armazenado em STATE.iterations[].
// =============================================================================

'use strict';

// ============================================================
// RENDER COMPLETO (re-pinta tudo)
// ============================================================
function renderLogPanel(turnoInfoAtual){
  const wrap = $('logWrap');
  if(!wrap) return;

  const turnos = STATE.iterations;
  const elInfo = $('logInfo');

  if(turnos.length === 0){
    wrap.innerHTML = `
      <div style="color:var(--ink-low); padding:12px; text-align:center; font-style:italic;">
        — sem iterações ainda —<br>
        digite algo no chat e clique CALCULAR
      </div>
    `;
    if(elInfo) elInfo.textContent = 'aguardando primeiro cálculo';
    return;
  }

  // Render reverso (mais recente em cima)
  const html = turnos.slice().reverse().map(t => _renderTurno(t)).join('');
  wrap.innerHTML = html;

  if(elInfo){
    const total_iter = turnos.reduce((s, t) => s + t.iteracoes.length, 0);
    const tempo_total = turnos.reduce((s, t) => s + (t.tempo_ms || 0), 0);
    elInfo.textContent = `${turnos.length} turno(s) · ${total_iter} iter · ${tempo_total}ms total`;
  }
}

// ============================================================
// RENDER DE UM TURNO
// ============================================================
function _renderTurno(t){
  const conv_id = (t.session_id || '').slice(-6);
  const head = `
    <div class="head">
      <span>▸ turno ${t.turno} · "${escapeHtml((t.entrada || '').slice(0, 30))}${(t.entrada || '').length > 30 ? '...' : ''}"</span>
      <span style="color:var(--ink-low); font-size:10px">${t.iteracoes.length} iter · ${t.tempo_ms}ms · ${t.convergiu ? '✓' : '⚠'}</span>
    </div>
  `;

  const linhas = t.iteracoes.map(it => _renderIter(it)).join('');

  const footer = t.resposta ? `
    <div class="iter-line" style="border-left-color: var(--ai); margin-top: 6px; color: var(--ai)">
      <span class="tag" style="background:var(--ai); color:var(--bg-deep)">DIRÁ</span>
      ${escapeHtml(t.resposta)}
    </div>
  ` : '';

  return `<div class="iter-box">${head}${linhas}${footer}</div>`;
}

// ============================================================
// RENDER DE UMA ITERAÇÃO
// ============================================================
function _renderIter(it){
  const kind = it.kind || 'infer';
  return `
    <div class="iter-line ${kind}">
      <span class="tag">${it.n}</span>${escapeHtml(it.descricao)}
    </div>
  `;
}

// ============================================================
// EXPORT DO LOG ISOLADO
// ============================================================
function exportLog(){
  const data = {
    versao: LAB_VERSION,
    capturado_em: new Date().toISOString(),
    session_atual: STATE.session_atual,
    total_turnos: STATE.iterations.length,
    iteracoes: STATE.iterations,
    logic_chains: STATE.logic_chains,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lab_v${LAB_VERSION}_LOG_${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log('[log] exportado');
}

// ============================================================
// EXPOR
// ============================================================
window.renderLogPanel = renderLogPanel;
window.exportLog      = exportLog;

console.log('[ui_log v7] carregado');
