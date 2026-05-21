// =============================================================================
// LEARN_ETIQUETA_PROVISORIA.JS — Lab v7 - Raciocínio
//
// PROMOÇÃO DE ETIQUETAS PROVISÓRIAS.
//
// FILOSOFIA:
//   Quando o user responde a uma pergunta tipo "o que é olho?" com
//   "parte do corpo", o sistema:
//   1. CRIA (ou encontra) um concept genérico chamado "parte_corpo"
//   2. RELIGA a palavra "olho" — antes ligada à provisional —
//      agora ao concept oficial via 'é_tipo_de'
//   3. MARCA a provisional como _status='promovida' (mantém pra histórico)
//   4. PROMOVE a hipótese pra 'confirmada' se houver
//   5. INCREMENTA mass do novo concept
//
// EFEITO:
//   Da próxima vez que aparecer "olho", o pulso vai propagar
//   olho → concept_parte_corpo → e por aí vai. O sistema agora SABE
//   que olho é parte do corpo, e essa informação está na REDE.
//
// IMPORTANTE: este é o mecanismo que faz o lab "crescer logicamente".
// =============================================================================

'use strict';

// ============================================================
// PROMOVE PROVISIONAL
// args = {
//   provisional_id:  node_id da provisional (ex: "categoria_temp_olho")
//   categoria_dita:  texto que o user usou ("parte do corpo", "uma cor", "nome")
//   hypothesis_id:   node_id da hipótese (opcional)
//   palavra_node_id: node_id da palavra-alvo
//   userInputNodeId, turnoInfo
// }
// Retorna: {concept_oficial_id, promovida}
// ============================================================
function learnPromoverProvisional(args){
  const {provisional_id, categoria_dita, hypothesis_id,
         palavra_node_id, userInputNodeId, turnoInfo} = args;

  if(!categoria_dita) return {promovida: false, motivo: 'sem categoria_dita'};

  // ============================================================
  // 1. NORMALIZA o nome da categoria (cria id estável)
  // ex: "parte do corpo" → "concept_parte_corpo"
  // ============================================================
  const catNorm = norm(categoria_dita)
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const conceptId = 'concept_' + catNorm;

  // ============================================================
  // 2. CRIA ou encontra concept oficial
  // ============================================================
  let conceptNode = STATE.nodes.find(n => n.id === conceptId);
  let conceptCriado = false;

  if(!conceptNode){
    conceptNode = makeNode({
      id:          conceptId,
      type:        'concept',
      layer:       'core',
      origin_type: 'ORGANIC_LEARNING',
      text:        categoria_dita,
      mass:        3,
      energy:      0,
      is_anchor:   1,
    });
    conceptNode._origem_user = true;
    conceptNode._criado_turno = STATE.turn;
    STATE.nodes.push(conceptNode);
    conceptCriado = true;

    _addIterLogL(turnoInfo, 'create',
      `learn: criou concept oficial "${conceptId}" pela primeira vez`,
      {concept_id: conceptId, categoria: categoria_dita});
  } else {
    // Já existia — reforça
    conceptNode.mass = (conceptNode.mass || 1) + 0.5;
    conceptNode.lastAccessed = nowT();
    _addIterLogL(turnoInfo, 'infer',
      `learn: concept "${conceptId}" já existia → reforçado`,
      {concept_id: conceptId});
  }

  // ============================================================
  // 3. RELIGA a palavra: word → provisional vira word → concept oficial
  // ============================================================
  if(palavra_node_id){
    // Procura aresta word → provisional
    const arestasParaRemover = [];
    for(let i = 0; i < STATE.edges.length; i++){
      const e = STATE.edges[i];
      if((e.a === palavra_node_id && e.b === provisional_id) ||
         (e.b === palavra_node_id && e.a === provisional_id)){
        arestasParaRemover.push(e);
      }
    }
    // Remove
    STATE.edges = STATE.edges.filter(e => !arestasParaRemover.includes(e));

    // Cria aresta forte palavra → concept oficial
    STATE.edges.push(makeEdge({
      a: palavra_node_id, b: conceptNode.id,
      w: 0.85, kind: 'é_tipo_de'
    }));

    _addIterLogL(turnoInfo, 'create',
      `learn: religou palavra → ${conceptId} (${arestasParaRemover.length} aresta(s) provisórias removidas)`,
      {removidas: arestasParaRemover.length});
  }

  // ============================================================
  // 4. MARCA provisional como promovida (NÃO deleta — histórico)
  // ============================================================
  const provNode = STATE.nodes.find(n => n.id === provisional_id);
  if(provNode){
    provNode._status = 'promovida';
    provNode._promovida_para = conceptId;
    provNode.brightness = Math.max(0.1, (provNode.brightness || 0.5) - 0.4);
    provNode._provisional = false;   // não é mais provisional ativa
  }

  // ============================================================
  // 5. ATUALIZA hipótese se houver
  // ============================================================
  if(hypothesis_id){
    const hypo = STATE.nodes.find(n => n.id === hypothesis_id);
    if(hypo){
      hypo._status = 'confirmada';
      hypo._confidence = 0.9;
      hypo.mass = (hypo.mass || 1) + 1;
      hypo._promoveu_para = conceptId;
    }
  }

  return {
    concept_oficial_id: conceptId,
    concept_node: conceptNode,
    concept_criado: conceptCriado,
    promovida: true,
  };
}

// ============================================================
// DESCARTA PROVISÓRIAS ABANDONADAS
// Chamada pela meditação: provisórias com >N turnos sem resposta = lixo
// ============================================================
function learnDescartarProvisoriasAntigas(maxTurnos){
  maxTurnos = maxTurnos || 10;
  const descartadas = [];

  for(const n of STATE.nodes){
    if(n.type !== 'provisional') continue;
    if(n._status !== 'aguardando_resposta') continue;
    const idade = STATE.turn - (n._turno_criada || STATE.turn);
    if(idade > maxTurnos){
      n._status = 'descartada';
      n.brightness = 0.1;
      n.mass = (n.mass || 1) * 0.3;
      descartadas.push(n.id);
    }
  }
  return descartadas;
}

// ============================================================
// STATS DE APRENDIZADO
// ============================================================
function learnStats(){
  return {
    provisionais_aguardando: STATE.nodes.filter(n => n.type === 'provisional' && n._status === 'aguardando_resposta').length,
    provisionais_promovidas: STATE.nodes.filter(n => n.type === 'provisional' && n._status === 'promovida').length,
    provisionais_descartadas:STATE.nodes.filter(n => n.type === 'provisional' && n._status === 'descartada').length,
    hipoteses_pendentes:     STATE.nodes.filter(n => n.type === 'hypothesis' && n._status === 'pendente').length,
    hipoteses_confirmadas:   STATE.nodes.filter(n => n.type === 'hypothesis' && n._status === 'confirmada').length,
    hipoteses_refutadas:     STATE.nodes.filter(n => n.type === 'hypothesis' && n._status === 'refutada').length,
    concepts_aprendidos:     STATE.nodes.filter(n => n.type === 'concept' && n._origem_user).length,
  };
}

function _addIterLogL(turnoInfo, kind, descricao, dados){
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
window.learnPromoverProvisional     = learnPromoverProvisional;
window.learnDescartarProvisoriasAntigas = learnDescartarProvisoriasAntigas;
window.learnStats                   = learnStats;

console.log('[learn_etiqueta_provisoria v7] carregado');
