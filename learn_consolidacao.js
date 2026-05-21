// =============================================================================
// LEARN_CONSOLIDACAO.JS — Lab v7 - Raciocínio
//
// MEDITAÇÃO PERIÓDICA — limpa, funde, consolida.
//
// FILOSOFIA:
//   A rede acumula lixo:
//   - provisionais abandonadas (nunca foram respondidas)
//   - fatos _superseded velhos demais
//   - hipóteses pendentes que ninguém vai confirmar
//   - duplicatas (mesma palavra criada em casos diferentes)
//   - contradições pendentes
//
//   Meditação varre tudo, decide o que limpar/fundir/consolidar.
//   Diferente do DreamEngine pesado do projeto principal — aqui é uma
//   rotina rápida (~50ms) que roda quando o user clica "MEDITAR" ou
//   a cada N turnos automaticamente.
//
// PASSOS:
//   1. DESCARTA provisórios abandonados >10 turnos
//   2. FUNDE word-nodes duplicados (mesmo text, diferentes ids)
//   3. PROMOVE em super-núcleo nós com mass > MASSA_CRITICA
//   4. DECAY nó-fato superseded muito antigo (brightness < 0.1 e idade > 20)
//      → remove do grafo
//   5. PROPÕE resolução pra contradições pendentes (escolhe o mais recente
//      por padrão; pra severidade alta sinaliza pra perguntar ao user)
//   6. CONSOLIDA hipóteses confirmadas em arestas extras (reforço estrutural)
// =============================================================================

'use strict';

// ============================================================
// AÇÃO PRINCIPAL: medita
// args = {turnoInfo, automatica?}
// Retorna: {resumo: {descartadas, fundidas, super, decaidas, contras_propostas, hipo_consolidadas}}
// ============================================================
function learnMeditar(args){
  args = args || {};
  const t0 = nowT();
  const turnoInfo = args.turnoInfo;
  const automatica = !!args.automatica;

  const resumo = {
    descartadas:        0,
    fundidas:           0,
    super_promovidos:   0,
    decaidas:           0,
    contras_propostas:  0,
    hipo_consolidadas:  0,
    tempo_ms:           0,
  };

  // ============================================================
  // 1. DESCARTA provisórios abandonados
  // ============================================================
  if(typeof learnDescartarProvisoriasAntigas === 'function'){
    const descartadas = learnDescartarProvisoriasAntigas(10);
    resumo.descartadas = descartadas.length;
  }

  // ============================================================
  // 2. FUNDE word-nodes duplicados
  //    Pode haver "word_olho" e "word_olhos" — fundimos baseado em prefixo+plural
  // ============================================================
  resumo.fundidas = _fundirDuplicatas();

  // ============================================================
  // 3. PROMOVE super-núcleos (nós com mass alto que ainda não são super)
  // ============================================================
  for(const n of STATE.nodes){
    if(n.is_super) continue;
    if((n.mass || 0) > (PHYSICS.MASSA_CRITICA || 5)){
      // Promove só se for nó "central" (concept, identity, super-pattern)
      if(['concept', 'identity_user', 'identity_self', 'pattern', 'rule'].includes(n.type)){
        n.is_super = 1;
        n.is_anchor = 1;
        resumo.super_promovidos++;
      }
    }
  }

  // ============================================================
  // 4. DECAY de fatos superseded muito antigos
  //    Critério: brightness <= 0.15 E mais de 20 turnos parado
  //    → remove do grafo (e arestas órfãs)
  // ============================================================
  resumo.decaidas = _decayAntigos();

  // ============================================================
  // 5. CONTRADIÇÕES PENDENTES — propõe resolução
  // ============================================================
  if(typeof listContradicoesPendentes === 'function'){
    const contras = listContradicoesPendentes();
    for(const c of contras){
      if(c.severidade === 'alta'){
        // Severidade alta — espera o user esclarecer (não auto-resolve)
        continue;
      }
      // Severidade média/baixa — mantém o mais recente
      const fa = STATE.nodes.find(n => n.id === c.fato_a);
      const fb = STATE.nodes.find(n => n.id === c.fato_b);
      const turnoA = fa?._turno || 0;
      const turnoB = fb?._turno || 0;
      const manter = turnoA >= turnoB ? c.fato_a : c.fato_b;

      if(typeof resolverContradicao === 'function'){
        resolverContradicao(manter, manter, 'meditação: manteve o mais recente');
        resumo.contras_propostas++;
      }
    }
  }

  // ============================================================
  // 6. CONSOLIDA HIPÓTESES CONFIRMADAS
  //    Pra cada hipótese confirmada, garante aresta estrutural reforçada
  // ============================================================
  const hipotesesConfirmadas = STATE.nodes.filter(n =>
    n.type === 'hypothesis' && n._status === 'confirmada' && !n._consolidada
  );
  for(const h of hipotesesConfirmadas){
    h.mass = (h.mass || 1) + 0.5;
    h._consolidada = true;
    resumo.hipo_consolidadas++;
  }

  // ============================================================
  // Registra meditação no STATE
  // ============================================================
  if(!STATE.meditacoes) STATE.meditacoes = [];
  resumo.tempo_ms = nowT() - t0;
  STATE.meditacoes.push({
    turno:      STATE.turn,
    timestamp:  new Date().toISOString(),
    automatica: automatica,
    resumo:     {...resumo},
  });

  _addIterLogM(turnoInfo, 'action',
    `meditação: ${resumo.descartadas} desc · ${resumo.fundidas} fund · ${resumo.super_promovidos} super · ${resumo.decaidas} dec · ${resumo.contras_propostas} contra · ${resumo.hipo_consolidadas} hipo (${resumo.tempo_ms}ms)`,
    resumo);

  return resumo;
}

// ============================================================
// HELPER: funde word-nodes duplicados
// Considera prefixo+plural simples (olho/olhos)
// Mantém o que tem mais mass; transfere arestas pro vencedor
// ============================================================
function _fundirDuplicatas(){
  let total = 0;
  const words = STATE.nodes.filter(n => n.type === 'word' && !n._seed);

  // Agrupa por text-base (sem 's' final)
  const grupos = {};
  for(const w of words){
    const t = (w.text || '').toLowerCase();
    const base = t.endsWith('s') ? t.slice(0, -1) : t;
    if(!grupos[base]) grupos[base] = [];
    grupos[base].push(w);
  }

  for(const base in grupos){
    const grupo = grupos[base];
    if(grupo.length < 2) continue;

    // Escolhe vencedor — maior mass; em empate, o com mais arestas
    grupo.sort((a, b) => (b.mass || 0) - (a.mass || 0));
    const vencedor = grupo[0];
    const perdedores = grupo.slice(1);

    for(const p of perdedores){
      // Redireciona arestas do perdedor pro vencedor
      for(const e of STATE.edges){
        if(e.a === p.id) e.a = vencedor.id;
        if(e.b === p.id) e.b = vencedor.id;
      }
      // Junta mass
      vencedor.mass = (vencedor.mass || 0) + (p.mass || 0) * 0.5;
      // Marca perdedor pra remoção
      p._merged_into = vencedor.id;
    }

    // Remove perdedores
    const perdedorIds = new Set(perdedores.map(p => p.id));
    STATE.nodes = STATE.nodes.filter(n => !perdedorIds.has(n.id));
    // Remove arestas que viraram self-loop após o merge
    STATE.edges = STATE.edges.filter(e => e.a !== e.b);

    total += perdedores.length;
  }

  return total;
}

// ============================================================
// HELPER: decay de nós muito antigos e fracos
// ============================================================
function _decayAntigos(){
  const antesNodes = STATE.nodes.length;
  const idsParaRemover = new Set();

  for(const n of STATE.nodes){
    // Só remove fatos superseded com brightness muito baixa e idade > 20
    if(!n._superseded) continue;
    if((n.brightness || 0) > 0.15) continue;
    if(n.is_anchor || n.is_super || n._seed) continue;
    const idade = STATE.turn - (n._turno || 0);
    if(idade < 20) continue;
    idsParaRemover.add(n.id);
  }

  if(idsParaRemover.size > 0){
    STATE.nodes = STATE.nodes.filter(n => !idsParaRemover.has(n.id));
    STATE.edges = STATE.edges.filter(e =>
      !idsParaRemover.has(e.a) && !idsParaRemover.has(e.b)
    );
  }

  return idsParaRemover.size;
}

// ============================================================
// STATS
// ============================================================
function consolidacaoStats(){
  return {
    meditacoes_total:       (STATE.meditacoes || []).length,
    ultima_meditacao:       (STATE.meditacoes || []).slice(-1)[0] || null,
    super_nucleos:          STATE.nodes.filter(n => n.is_super).length,
    fatos_superseded:       STATE.nodes.filter(n => n._superseded).length,
    provisorios_descartados:STATE.nodes.filter(n => n.type === 'provisional' && n._status === 'descartada').length,
  };
}

function _addIterLogM(turnoInfo, kind, descricao, dados){
  if(!turnoInfo) return;
  turnoInfo.iteracoes.push({
    n:         turnoInfo.iteracoes.length + 1,
    kind:      kind,
    descricao: descricao,
    dados:     dados || null,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// EXPOR
// ============================================================
window.learnMeditar        = learnMeditar;
window.consolidacaoStats   = consolidacaoStats;

console.log('[learn_consolidacao v7] carregado');
