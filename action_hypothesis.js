// =============================================================================
// ACTION_HYPOTHESIS.JS — Lab v7 - Raciocínio
//
// HIPÓTESES E ETIQUETAS PROVISÓRIAS.
//
// FILOSOFIA:
//   Quando o sistema vê algo novo, em vez de:
//     (a) inventar etiqueta secretamente e fingir que sabe → BURRO
//     (b) ignorar e cair em fallback → BURRO
//   Ele:
//     1. CRIA uma hypothesis explícita: "acho que X é tipo de Y"
//     2. CRIA uma etiqueta provisória pra ter ONDE colocar X
//     3. CONECTA hipótese ao input (rastreável)
//     4. MARCA confidence baixa
//     5. O action_ask depois usa essa hipótese pra perguntar
//
// DOIS TIPOS DE NÓ NOVOS:
//   - hypothesis: suposição do sistema (type='hypothesis', _confidence)
//   - provisional: etiqueta inventada (type='provisional', _provisional=true)
//
// CICLO DE VIDA:
//   1. nasce com confidence 0.3-0.5
//   2. action_ask pergunta ao user
//   3. user responde:
//      - confirma → learn_etiqueta_provisoria promove a tipo real
//      - corrige → confidence baixa + cria nova hipótese
//      - ignora → meditação descarta depois de N turnos
// =============================================================================

'use strict';

// ============================================================
// CRIA HIPÓTESE
// args = {
//   sobre:        string ou node_id (o que a hipótese é sobre)
//   afirma:       string ("é tipo de parte_corpo", "se refere a usuário")
//   confidence:   0.0–1.0 (default 0.4 — chute moderado)
//   evidencia:    array de node_ids que apoiam
//   userInputNodeId, parseNodeId, turnoInfo
// }
// Retorna: {hypothesis_node}
// ============================================================
function actionHypothesis(args){
  const {sobre, afirma, confidence, evidencia, userInputNodeId, parseNodeId, turnoInfo} = args;

  const conf = (typeof confidence === 'number') ? confidence : 0.4;

  const hypoNode = makeNode({
    type:        'hypothesis',
    layer:       'mantle',
    origin_type: 'INFERENCE',
    text:        `hipótese: ${afirma}`,
    mass:        1.2,
    energy:      3,
    session_id:  STATE.session_atual,
    fire_id:     nextFireId(),
    hypothesis:  true,
  });
  hypoNode._sobre      = sobre;
  hypoNode._afirma     = afirma;
  hypoNode._confidence = conf;
  hypoNode._turno_criada = STATE.turn;
  hypoNode._status     = 'pendente';  // pendente | confirmada | refutada | descartada
  STATE.nodes.push(hypoNode);

  // Liga ao "sobre" (se for node_id válido)
  if(sobre && STATE.nodes.find(n => n.id === sobre)){
    STATE.edges.push(makeEdge({
      a: hypoNode.id, b: sobre, w: conf, kind: 'deriva_de'
    }));
  }

  // Liga às evidências
  if(Array.isArray(evidencia)){
    for(const evId of evidencia){
      if(STATE.nodes.find(n => n.id === evId)){
        STATE.edges.push(makeEdge({
          a: hypoNode.id, b: evId, w: 0.5, kind: 'deriva_de'
        }));
      }
    }
  }

  // Liga ao input
  if(userInputNodeId){
    STATE.edges.push(makeEdge({
      a: userInputNodeId, b: hypoNode.id, w: 0.4, kind: 'sequence'
    }));
  }
  if(parseNodeId){
    STATE.edges.push(makeEdge({
      a: parseNodeId, b: hypoNode.id, w: 0.5, kind: 'sequence'
    }));
  }

  _addIterLogH(turnoInfo, 'infer',
    `hypothesis: "${afirma}" (conf=${conf.toFixed(2)})`,
    {hypo_id: hypoNode.id, sobre, afirma, conf});

  return {hypothesis_node: hypoNode};
}

// ============================================================
// CRIA ETIQUETA PROVISÓRIA
// Quando o sistema encontra uma palavra-X e não sabe a categoria dela,
// inventa uma etiqueta provisional pra ter onde encaixar e questiona.
//
// args = {
//   palavra:     "olho"
//   palavra_id:  node_id da word
//   contexto_hint: 'corpo' | 'cor' | 'nome' | null   (chute baseado no contexto)
//   userInputNodeId, turnoInfo
// }
// Retorna: {provisional_node, etiqueta_inventada}
// ============================================================
function actionCreateProvisional(args){
  const {palavra, palavra_id, contexto_hint, userInputNodeId, turnoInfo} = args;

  // Inventa nome da etiqueta provisional
  const etiqueta = `categoria_temp_${palavra.replace(/[^a-z0-9]/g, '')}`;

  // Não duplica
  let existente = STATE.nodes.find(n => n.id === etiqueta);
  if(existente){
    return {provisional_node: existente, etiqueta_inventada: etiqueta, ja_existia: true};
  }

  const provNode = makeNode({
    id:          etiqueta,
    type:        'provisional',
    layer:       'mantle',
    origin_type: 'INFERENCE',
    text:        `categoria-temp (?): ${palavra}`,
    mass:        1,
    energy:      0,
    provisional: true,
  });
  provNode._categoria_alvo = palavra;
  provNode._hint           = contexto_hint;
  provNode._turno_criada   = STATE.turn;
  provNode._status         = 'aguardando_resposta';
  STATE.nodes.push(provNode);

  // Liga provisional ↔ palavra (relação tipo_de provisional)
  if(palavra_id && STATE.nodes.find(n => n.id === palavra_id)){
    STATE.edges.push(makeEdge({
      a: palavra_id, b: provNode.id, w: 0.5, kind: 'é_tipo_de'
    }));
  }
  // Liga ao input
  if(userInputNodeId){
    STATE.edges.push(makeEdge({
      a: userInputNodeId, b: provNode.id, w: 0.3, kind: 'sequence'
    }));
  }

  _addIterLogH(turnoInfo, 'create',
    `provisional: inventou categoria temp "${etiqueta}" pra "${palavra}"`,
    {etiqueta, palavra, hint: contexto_hint});

  return {provisional_node: provNode, etiqueta_inventada: etiqueta, ja_existia: false};
}

// ============================================================
// LISTA HIPÓTESES PENDENTES (pra meditação consolidar depois)
// ============================================================
function listHipotesesPendentes(){
  return STATE.nodes.filter(n =>
    n.type === 'hypothesis' && n._status === 'pendente'
  );
}

// ============================================================
// LISTA PROVISIONAIS PENDENTES
// ============================================================
function listProvisionaisPendentes(){
  return STATE.nodes.filter(n =>
    n.type === 'provisional' && n._status === 'aguardando_resposta'
  );
}

function _addIterLogH(turnoInfo, kind, descricao, dados){
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
window.actionHypothesis         = actionHypothesis;
window.actionCreateProvisional  = actionCreateProvisional;
window.listHipotesesPendentes   = listHipotesesPendentes;
window.listProvisionaisPendentes= listProvisionaisPendentes;

console.log('[action_hypothesis v7] carregado');
