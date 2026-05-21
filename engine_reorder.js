// =============================================================================
// ENGINE_REORDER.JS — Lab v7 - Raciocínio
//
// REORDENAÇÃO DE SIMULAÇÕES.
//
// FILOSOFIA:
//   Pega histórico de N mensagens user. Permuta a ordem. Simula
//   o aprendizado em cada permutação. Compara qualidade da rede final.
//
//   "Ordem ideal" = aquela que produz rede mais coerente:
//     - menos provisórios pendentes
//     - menos fatos superseded
//     - mais rules aprendidas
//     - menos contradições não-resolvidas
//
// SEM EXPLOSÃO COMBINATÓRIA:
//   N mensagens → N! permutações. Pra 10 isso é 3.6M.
//   Em vez disso, testa K permutações (default 20):
//     - Ordem original
//     - K-2 permutações aleatórias (Fisher-Yates)
//     - 1 ordem heurística: agrupar mensagens "do mesmo tópico" juntas
//
// SNAPSHOT/RESTORE:
//   Salva STATE inteiro num blob → simula → restaura.
//   Cada simulação é isolada — não polui o estado real.
//
// SAÍDA:
//   {
//     ordens_testadas: K,
//     ranking: [{ordem, qualidade, deltas, descricao}],
//     melhor_ordem,
//     pior_ordem,
//     tempo_total_ms
//   }
//
// IMPORTANTE: enquanto roda (~50ms por simulação × K), UI fica bloqueada.
// Pra grandes K, considere dar feedback visual.
// =============================================================================

'use strict';

// ============================================================
// FUNÇÃO PRINCIPAL
// args = {
//   K?,            // número de ordens a testar (default 12)
//   incluir_heuristicas?, // testa também ordens heurísticas (default true)
//   apenas_user?,  // só usa mensagens user (ignora feedback) (default true)
// }
// Retorna: análise completa
// ============================================================
async function engineReorder(args){
  args = args || {};
  const K = args.K || 12;
  const incluirHeur = args.incluir_heuristicas !== false;
  const apenasUser = args.apenas_user !== false;
  const t0 = nowT();

  // ============================================================
  // 1. EXTRAI HISTÓRICO DE ENTRADAS
  // ============================================================
  let entradas = [];
  for(const turno of STATE.iterations){
    if(!turno.entrada) continue;
    entradas.push(turno.entrada);
  }

  if(apenasUser){
    // ignora confirmações/negações simples
    entradas = entradas.filter(e => {
      const t = norm(e);
      return !['sim','nao','não','ok','perfeito','errado','tchau'].includes(t);
    });
  }

  if(entradas.length < 3){
    return {
      erro: 'histórico muito curto (mínimo 3 mensagens) — converse mais antes de testar reordenação',
      total_entradas: entradas.length,
    };
  }
  if(entradas.length > 25){
    // Limita pra não explodir
    entradas = entradas.slice(-25);
  }

  // ============================================================
  // 2. GERA ORDENS A TESTAR
  // ============================================================
  const ordens = [];

  // Ordem original (índices)
  const baseIdx = entradas.map((_, i) => i);
  ordens.push({nome: 'original', indices: baseIdx.slice()});

  // K-2 ordens aleatórias
  const aleatoriasN = Math.max(1, K - (incluirHeur ? 4 : 2));
  for(let k = 0; k < aleatoriasN; k++){
    const a = baseIdx.slice();
    // Fisher-Yates
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    ordens.push({nome: `aleatória_${k+1}`, indices: a});
  }

  // Ordens heurísticas
  if(incluirHeur){
    // (a) Inverso temporal
    ordens.push({nome: 'inverso', indices: baseIdx.slice().reverse()});

    // (b) Agrupada por similaridade jaccard
    const idxsAgrup = _agruparPorSimilaridade(entradas);
    ordens.push({nome: 'agrupada_topico', indices: idxsAgrup});

    // (c) Exemplos antes (frases curtas e com ops/números primeiro)
    const idxsEx = _exemplosAntes(entradas);
    ordens.push({nome: 'exemplos_primeiro', indices: idxsEx});
  }

  // ============================================================
  // 3. SNAPSHOT do STATE atual (vamos restaurar depois)
  // ============================================================
  const snapshotOriginal = _snapshotState();

  // ============================================================
  // 4. SIMULA CADA ORDEM
  // ============================================================
  const ranking = [];
  for(const ordem of ordens){
    // Pega ordem corresponde de entradas
    const sequencia = ordem.indices.map(i => entradas[i]);

    // Reset pra um STATE limpo (mantém seed)
    _resetToSeed();

    // Simula
    for(const txt of sequencia){
      try {
        await calcular(txt);
      } catch(e){
        // continua mesmo se uma der erro
      }
    }

    // Mede qualidade
    const qual = _medirQualidadeRede();

    ranking.push({
      ordem:      ordem.nome,
      indices:    ordem.indices.slice(),
      sequencia:  sequencia,
      qualidade:  qual.score,
      detalhes:   qual,
    });
  }

  // ============================================================
  // 5. RESTAURA STATE original
  // ============================================================
  _restoreState(snapshotOriginal);

  // ============================================================
  // 6. RANKEIA
  // ============================================================
  ranking.sort((a, b) => b.qualidade - a.qualidade);

  const tempo_total_ms = nowT() - t0;

  return {
    total_entradas:    entradas.length,
    ordens_testadas:   ordens.length,
    melhor_ordem:      ranking[0],
    pior_ordem:        ranking[ranking.length - 1],
    ranking,
    tempo_total_ms,
    nota: 'STATE original foi preservado — esta análise é apenas exploratória.',
  };
}

// ============================================================
// HELPER: snapshot do STATE inteiro
// Usa deep-clone via JSON (lento mas seguro)
// ============================================================
function _snapshotState(){
  // Clona só o que importa pra simulação. Preserva tudo que muda.
  return {
    nodes:           JSON.parse(JSON.stringify(STATE.nodes)),
    edges:           JSON.parse(JSON.stringify(STATE.edges)),
    dossiers:        JSON.parse(JSON.stringify(STATE.dossiers)),
    selfDossier:     JSON.parse(JSON.stringify(STATE.selfDossier)),
    iterations:      JSON.parse(JSON.stringify(STATE.iterations)),
    logic_chains:    JSON.parse(JSON.stringify(STATE.logic_chains)),
    definitions:     JSON.parse(JSON.stringify(STATE.definitions || {})),
    contradicoes:    JSON.parse(JSON.stringify(STATE.contradicoes || [])),
    meditacoes:      JSON.parse(JSON.stringify(STATE.meditacoes || [])),
    activeSubject:   STATE.activeSubject,
    pendingClarify:  STATE.pendingClarify ? JSON.parse(JSON.stringify(STATE.pendingClarify)) : null,
    turn:            STATE.turn,
    session_atual:   STATE.session_atual,
    seed:            JSON.parse(JSON.stringify(STATE.seed)),
  };
}

function _restoreState(snap){
  STATE.nodes          = snap.nodes;
  STATE.edges          = snap.edges;
  STATE.dossiers       = snap.dossiers;
  STATE.selfDossier    = snap.selfDossier;
  STATE.iterations     = snap.iterations;
  STATE.logic_chains   = snap.logic_chains;
  STATE.definitions    = snap.definitions;
  STATE.contradicoes   = snap.contradicoes;
  STATE.meditacoes     = snap.meditacoes;
  STATE.activeSubject  = snap.activeSubject;
  STATE.pendingClarify = snap.pendingClarify;
  STATE.turn           = snap.turn;
  STATE.session_atual  = snap.session_atual;
  STATE.seed           = snap.seed;
}

// ============================================================
// HELPER: reseta STATE pra só a seed (limpa interações)
// ============================================================
function _resetToSeed(){
  // Mantém só nós/arestas da seed
  const seedIds = new Set(STATE.seed.nucleosSeed || []);
  STATE.nodes = STATE.nodes.filter(n => seedIds.has(n.id) || n._seed);
  STATE.edges = STATE.edges.filter(e => e._seed ||
    (seedIds.has(e.a) && seedIds.has(e.b)));

  // Zera estado dinâmico
  STATE.dossiers       = {};
  STATE.selfDossier    = {};
  STATE.iterations     = [];
  STATE.logic_chains   = [];
  STATE.definitions    = {};
  STATE.contradicoes   = [];
  STATE.meditacoes     = [];
  STATE.activeSubject  = null;
  STATE.pendingClarify = null;
  STATE.turn           = 0;
  STATE.session_atual  = newSessionId();

  // Zera energia/brightness/mass dos seed
  for(const n of STATE.nodes){
    n.energy = 0;
    if(!n._seed) continue;
    // mass volta ao default mas mantém estrutura
  }
}

// ============================================================
// MÉTRICA DE QUALIDADE DA REDE
// Score = composto positivo (rules, cadeias boas) - negativo (provisional, contradição, superseded)
// ============================================================
function _medirQualidadeRede(){
  const provisionais = STATE.nodes.filter(n => n.type === 'provisional' && n._status === 'aguardando_resposta').length;
  const provisionaisPromovidas = STATE.nodes.filter(n => n.type === 'provisional' && n._status === 'promovida').length;
  const superseded   = STATE.nodes.filter(n => n._superseded).length;
  const rules        = STATE.nodes.filter(n => n.type === 'rule_math').length;
  const concepts     = STATE.nodes.filter(n => n.type === 'concept' && n._origem_user).length;
  const contradicoesPendentes = (STATE.contradicoes || []).filter(c => c.status === 'pendente').length;
  const cadeiasBoas  = STATE.logic_chains.filter(c => c.marcada === 'boa').length;
  const cadeiasRuins = STATE.logic_chains.filter(c => c.marcada === 'ruim').length;
  const fatos        = STATE.nodes.filter(n =>
    (n.type === 'identity_fact' || n.type === 'identity_attr') && !n._superseded
  ).length;

  // Fórmula de qualidade — heurística
  // Positivo: rules aprendidas valem MUITO (são o ápice)
  //           concepts aprendidos do user valem
  //           cadeias boas valem
  //           fatos consolidados valem
  //           provisórios PROMOVIDOS são positivos (aprendizado completo)
  // Negativo: provisórios pendentes (lixo)
  //           superseded (revisão)
  //           contradições pendentes
  //           cadeias ruins (erros)
  const score =
      rules * 15
    + concepts * 5
    + provisionaisPromovidas * 4
    + cadeiasBoas * 3
    + fatos * 2
    - provisionais * 2
    - superseded * 1.5
    - contradicoesPendentes * 4
    - cadeiasRuins * 2;

  return {
    score:                Number(score.toFixed(2)),
    rules,
    concepts_user:        concepts,
    provisionais_pendentes: provisionais,
    provisionais_promovidas: provisionaisPromovidas,
    superseded,
    contradicoes_pendentes: contradicoesPendentes,
    cadeias_boas:         cadeiasBoas,
    cadeias_ruins:        cadeiasRuins,
    fatos_ativos:         fatos,
    total_nodes:          STATE.nodes.length,
    total_edges:          STATE.edges.length,
  };
}

// ============================================================
// HEURÍSTICA: agrupa por similaridade jaccard
// ============================================================
function _agruparPorSimilaridade(entradas){
  if(entradas.length <= 2) return entradas.map((_, i) => i);

  const restantes = entradas.map((_, i) => i);
  const ordem = [restantes.shift()];

  while(restantes.length > 0){
    // Acha o mais similar ao último adicionado
    const ultIdx = ordem[ordem.length - 1];
    const ultToks = tokens(entradas[ultIdx]);
    let melhorIdx = 0;
    let melhorJac = -1;
    for(let i = 0; i < restantes.length; i++){
      const toks = tokens(entradas[restantes[i]]);
      const j = jaccard(ultToks, toks);
      if(j > melhorJac){
        melhorJac = j;
        melhorIdx = i;
      }
    }
    ordem.push(restantes[melhorIdx]);
    restantes.splice(melhorIdx, 1);
  }
  return ordem;
}

// ============================================================
// HEURÍSTICA: exemplos antes
// (frases curtas com dígito ou operador vão pro topo)
// ============================================================
function _exemplosAntes(entradas){
  const indices = entradas.map((_, i) => i);
  return indices.sort((a, b) => {
    const ea = entradas[a], eb = entradas[b];
    // Tem dígito ou operador matemático? → vem antes
    const ehMathA = /[0-9+\-*/=÷×]/.test(ea);
    const ehMathB = /[0-9+\-*/=÷×]/.test(eb);
    if(ehMathA !== ehMathB) return ehMathA ? -1 : 1;
    // Mais curto vem antes
    return ea.length - eb.length;
  });
}

// ============================================================
// FORMATA RESULTADO PRA HUMANO LER
// ============================================================
function formatReorderReport(result){
  if(result.erro){
    return `⚠ ${result.erro}`;
  }
  const lines = [];
  lines.push(`📊 ANÁLISE DE REORDENAÇÃO`);
  lines.push(`${result.total_entradas} entradas · ${result.ordens_testadas} ordens testadas · ${result.tempo_total_ms}ms`);
  lines.push(``);
  lines.push(`🏆 MELHOR ORDEM: "${result.melhor_ordem.ordem}" (score=${result.melhor_ordem.qualidade})`);
  const md = result.melhor_ordem.detalhes;
  lines.push(`   ${md.rules} rule(s) · ${md.concepts_user} concept(s) · ${md.fatos_ativos} fato(s)`);
  lines.push(`   ${md.provisionais_pendentes} prov pendente · ${md.superseded} superseded · ${md.contradicoes_pendentes} contradição`);
  lines.push(``);
  lines.push(`📉 PIOR ORDEM: "${result.pior_ordem.ordem}" (score=${result.pior_ordem.qualidade})`);
  lines.push(``);
  lines.push(`RANKING COMPLETO:`);
  for(let i = 0; i < result.ranking.length; i++){
    const r = result.ranking[i];
    const marker = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '  '));
    lines.push(`  ${marker} ${(i+1).toString().padStart(2,' ')}. ${r.ordem.padEnd(20,' ')} score=${r.qualidade}  (R${r.detalhes.rules}/C${r.detalhes.concepts_user}/F${r.detalhes.fatos_ativos}/P${r.detalhes.provisionais_pendentes}/X${r.detalhes.contradicoes_pendentes})`);
  }
  lines.push(``);
  lines.push(`SEQUÊNCIA RECOMENDADA:`);
  result.melhor_ordem.sequencia.forEach((s, i) => {
    lines.push(`  ${(i+1).toString().padStart(2,' ')}. ${s}`);
  });
  return lines.join('\n');
}

// ============================================================
// EXPOR
// ============================================================
window.engineReorder       = engineReorder;
window.formatReorderReport = formatReorderReport;

console.log('[engine_reorder v7] carregado');
