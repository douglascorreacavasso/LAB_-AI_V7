// =============================================================================
// ACTION_WRITE.JS — Lab v7 - Raciocínio
//
// CRIA FATO REAL na rede + atualiza dossiê.
//
// FILOSOFIA:
//   Um fato vive em DOIS lugares pra ficar consistente:
//   1. Como nó identity_fact (ou identity_attr) na REDE — com pos, energy, mass
//   2. Como entrada no STATE.dossiers[sujeito] — pra leitura humana fácil
//
//   A REDE é a fonte real; o dossiê é projeção legível.
//
// FLUXO:
//   1. Garante nó-sujeito (cria identity_user se não existir)
//   2. Cria nó identity_fact com text, _predicado, _valor
//   3. Liga sujeito → fato (kind=é_atributo_de)
//   4. Liga fato → predicado-conceito (se for atributo conhecido)
//   5. Atualiza STATE.dossiers[sujeito][grupo][slot]
//   6. Se valor é word existente, liga fato → word
//   7. Se conflita com fato anterior, marca o antigo como _superseded
//
// IMPORTANTE: este módulo NÃO decide SE deve escrever — só EXECUTA quando
// o orquestrador (router) pede.
// =============================================================================

'use strict';

// ============================================================
// AÇÃO PRINCIPAL: escrever fato
// args = {
//   sujeito:     'douglas' | '__self__',
//   predicado:   'nome' | 'olhos' | 'idade' | ...
//   valor:       'Douglas' | 'azuis' | '25' | ...
//   grupo:       'identidade' | 'corpo' | 'preferencias' | 'conhecimento' | 'self'  (opcional)
//   slot:        'nome' | 'cor_olhos' | ...  (opcional — se não der, infere)
//   userInputNodeId, parseNodeId, turnoInfo
// }
// ============================================================
function actionWrite(args){
  const {sujeito, predicado, valor, userInputNodeId, parseNodeId, turnoInfo} = args;

  if(!sujeito || !valor){
    _addIterLogW(turnoInfo, 'warn',
      `write: faltou sujeito ou valor (sujeito=${sujeito}, valor=${valor})`, args);
    return null;
  }

  // ============================================================
  // 1. Garante nó-sujeito na rede
  // ============================================================
  let subjNode = _ensureSubjectNode(sujeito);

  // ============================================================
  // 2. Decidir grupo + slot do dossiê (mapeamento semântico)
  // ============================================================
  let {grupo, slot} = args;
  if(!grupo || !slot){
    const inf = _inferGrupoSlot(sujeito, predicado, valor);
    grupo = inf.grupo;
    slot  = inf.slot;
  }

  // ============================================================
  // 3. Detecta conflito (já existe fato igual para esse slot?)
  // ============================================================
  const fatoAnterior = _findFatoExistente(subjNode.id, predicado, slot, grupo);
  let foiUpdate = false;
  let valorAnterior = null;

  if(fatoAnterior){
    if((fatoAnterior._valor || '').toLowerCase() === String(valor).toLowerCase()){
      // já tem igual — reforça
      fatoAnterior.mass = (fatoAnterior.mass || 1) + 0.5;
      fatoAnterior.lastAccessed = nowT();
      _addIterLogW(turnoInfo, 'create',
        `write: já existia (${predicado || slot}=${valor}) → reforçado`,
        {sujeito, predicado, valor, fato_id: fatoAnterior.id});
      // também sincroniza dossiê pra garantir
      _updateDossier(sujeito, grupo, slot, valor);
      return {fato: fatoAnterior, novo: false, conflito: false};
    }
    // Há conflito — marca o antigo como superseded
    fatoAnterior._superseded = true;
    fatoAnterior.brightness = Math.max(0.1, (fatoAnterior.brightness || 0.5) - 0.3);
    valorAnterior = fatoAnterior._valor;
    foiUpdate = true;
  }

  // ============================================================
  // 4. Cria nó identity_fact (ou identity_attr) na rede
  // ============================================================
  const tipo = _ehAtributo(grupo) ? 'identity_attr' : 'identity_fact';

  const fatoNode = makeNode({
    type:         tipo,
    layer:        'mantle',
    origin_type:  'CHAT',
    text:         _composeFatoText(sujeito, predicado, valor),
    mass:         2.5,
    energy:       5,
    session_id:   STATE.session_atual,
  });
  fatoNode._predicado = predicado || slot;
  fatoNode._valor     = valor;
  fatoNode._sujeito   = sujeito;
  fatoNode._grupo     = grupo;
  fatoNode._slot      = slot;
  fatoNode._turno     = STATE.turn;
  STATE.nodes.push(fatoNode);

  // ============================================================
  // 5. Liga sujeito → fato
  // ============================================================
  STATE.edges.push(makeEdge({
    a: subjNode.id, b: fatoNode.id,
    w: 0.85, kind: 'é_atributo_de'
  }));

  // ============================================================
  // 6. Liga input → parse → write_node → fato (cadeia)
  // ============================================================
  const writeNode = makeNode({
    type:        'action_write',
    layer:       'write',
    origin_type: 'SYSTEM',
    text:        'write(' + (predicado || slot) + '=' + valor + ')',
    mass:        1,
    fire_id:     nextFireId(),
  });
  STATE.nodes.push(writeNode);
  if(parseNodeId){
    STATE.edges.push(makeEdge({a: parseNodeId, b: writeNode.id, w: 0.6, kind: 'sequence'}));
  } else if(userInputNodeId){
    STATE.edges.push(makeEdge({a: userInputNodeId, b: writeNode.id, w: 0.5, kind: 'sequence'}));
  }
  STATE.edges.push(makeEdge({a: writeNode.id, b: fatoNode.id, w: 0.9, kind: 'sequence'}));

  // ============================================================
  // 7. Se valor existe como word-node, liga fato → word
  // (deixa a rede mais densa pra recall)
  // ============================================================
  const valorWord = STATE.nodes.find(n =>
    n.type === 'word' && (n.text || '').toLowerCase() === String(valor).toLowerCase()
  );
  if(valorWord){
    STATE.edges.push(makeEdge({
      a: fatoNode.id, b: valorWord.id, w: 0.7, kind: 'tem'
    }));
  }

  // ============================================================
  // 8. Se predicado existe como word-node, liga fato → word(predicado)
  // ============================================================
  if(predicado){
    const predWord = STATE.nodes.find(n =>
      n.type === 'word' && (n.text || '').toLowerCase() === String(predicado).toLowerCase()
    );
    if(predWord){
      STATE.edges.push(makeEdge({
        a: fatoNode.id, b: predWord.id, w: 0.6, kind: 'é_atributo_de'
      }));
    }
  }

  // ============================================================
  // 9. Se foi update (sobrescrita), liga novo→antigo com 'contradiz'
  // ============================================================
  if(fatoAnterior){
    STATE.edges.push(makeEdge({
      a: fatoNode.id, b: fatoAnterior.id, w: 0.8, kind: 'contradiz'
    }));
  }

  // ============================================================
  // 10. Atualiza dossiê (espelho legível)
  // ============================================================
  _updateDossier(sujeito, grupo, slot, valor);

  // ============================================================
  // 11. Marca activeSubject se for user real
  // ============================================================
  if(sujeito !== '__self__' && sujeito !== '__pendente__'){
    STATE.activeSubject = sujeito;
  }

  _addIterLogW(turnoInfo, 'action',
    `write: ${foiUpdate ? 'ATUALIZA' : 'CRIA'} ${grupo}.${slot} = "${valor}"` +
    (foiUpdate ? ` (era "${valorAnterior}")` : ''),
    {sujeito, grupo, slot, valor, valor_anterior: valorAnterior, fato_id: fatoNode.id});

  return {
    fato: fatoNode,
    write_node: writeNode,
    novo: !foiUpdate,
    conflito: foiUpdate,
    valor_anterior: valorAnterior,
  };
}

// ============================================================
// HELPER: garante que existe um identity_user/identity_self/identity_pessoa
// pro sujeito. Se não, cria.
// ============================================================
function _ensureSubjectNode(sujeito){
  if(sujeito === '__self__'){
    // Self-Core
    return STATE.nodes.find(n => n.id === '__SELF_CORE__');
  }

  // Procura nó existente
  const existente = STATE.nodes.find(n =>
    (n.type === 'identity_user' || n.type === 'identity_pessoa') &&
    (n.text || '').toLowerCase() === String(sujeito).toLowerCase()
  );
  if(existente) return existente;

  // Não existe — cria como identity_user (provisional false, é real)
  const n = makeNode({
    id:          'user_' + String(sujeito).toLowerCase().replace(/[^a-z0-9]/g, ''),
    type:        'identity_user',
    layer:       'core',
    origin_type: 'CHAT',
    text:        cap(sujeito),
    mass:        4,
    is_anchor:   1,
    session_id:  STATE.session_atual,
  });
  STATE.nodes.push(n);

  // Liga ao Self-Core (relação básica de "user da conversa")
  STATE.edges.push(makeEdge({
    a: '__SELF_CORE__', b: n.id, w: 0.6, kind: 'co-occur'
  }));

  return n;
}

// ============================================================
// HELPER: infere grupo + slot do dossiê pelo predicado/valor
// ============================================================
function _inferGrupoSlot(sujeito, predicado, valor){
  const p = (predicado || '').toLowerCase();
  const v = (valor || '').toLowerCase();

  // SELF
  if(sujeito === '__self__'){
    if(p === 'nome')    return {grupo: 'self', slot: 'nome'};
    if(p === 'apelido') return {grupo: 'self', slot: 'apelido'};
    return {grupo: 'self', slot: p || 'attr'};
  }

  // USER
  if(p === 'nome')        return {grupo: 'identidade', slot: 'nome'};
  if(p === 'apelido')     return {grupo: 'identidade', slot: 'apelido'};
  if(p === 'papel' ||
     p === 'profissão' ||
     p === 'profissao')   return {grupo: 'identidade', slot: 'papel'};

  // Corpo
  if(p === 'olhos' || p.includes('olho'))   return {grupo: 'corpo', slot: 'cor_olhos'};
  if(p === 'cabelo' || p === 'pele' || p === 'mão' || p === 'pé' || p === 'partes')
    return {grupo: 'corpo', slot: 'partes'};

  // Preferências
  if(p === 'gosta' || p === 'gosto')     return {grupo: 'preferencias', slot: 'gosta'};
  if(p === 'nao gosta' || p === 'odeio') return {grupo: 'preferencias', slot: 'nao_gosta'};

  // Conhecimento
  if(p === 'sabe' || p === 'estuda' || p === 'conhece')
    return {grupo: 'conhecimento', slot: 'sabe_sobre'};

  // Default: vai pra conhecimento.sabe_sobre se nada mais bate
  return {grupo: 'conhecimento', slot: p || 'sabe_sobre'};
}

function _ehAtributo(grupo){
  // grupos que são atributos vs grupos que são fatos genéricos
  return ['identidade', 'self', 'corpo'].includes(grupo);
}

function _composeFatoText(sujeito, predicado, valor){
  const s = sujeito === '__self__' ? 'eu' : sujeito;
  return `(${s}, ${predicado || '?'}, ${valor})`;
}

// ============================================================
// HELPER: acha fato existente pro mesmo (sujeito, slot)
// ============================================================
function _findFatoExistente(subjId, predicado, slot, grupo){
  // Pra slots single: procura identity_fact/identity_attr com mesmo slot ligado ao sujeito
  return STATE.nodes.find(n => {
    if(n.type !== 'identity_fact' && n.type !== 'identity_attr') return false;
    if(n._superseded) return false;
    if(n._grupo === grupo && n._slot === slot){
      // Confere ligação com o sujeito
      const ligado = STATE.edges.some(e =>
        (e.a === n.id && e.b === subjId) || (e.a === subjId && e.b === n.id)
      );
      return ligado;
    }
    return false;
  });
}

// ============================================================
// HELPER: atualiza dossiê com flatten/dedupe (corrige bug v5/v6)
// ============================================================
function _updateDossier(sujeito, grupo, slot, valor){
  if(sujeito === '__self__'){
    STATE.selfDossier[slot] = valor;
    return;
  }
  if(!STATE.dossiers[sujeito])         STATE.dossiers[sujeito] = {};
  if(!STATE.dossiers[sujeito][grupo])  STATE.dossiers[sujeito][grupo] = {};

  const sl = window.SCHEMA?.[grupo]?.[slot];
  if(sl?.type === 'list'){
    if(!Array.isArray(STATE.dossiers[sujeito][grupo][slot])){
      STATE.dossiers[sujeito][grupo][slot] = [];
    }
    const arr = STATE.dossiers[sujeito][grupo][slot];
    const valLow = String(valor).toLowerCase();
    if(!arr.some(x => String(x).toLowerCase() === valLow)){
      arr.push(valor);
    }
  } else {
    STATE.dossiers[sujeito][grupo][slot] = valor;
  }
}

function _addIterLogW(turnoInfo, kind, descricao, dados){
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
window.actionWrite = actionWrite;

console.log('[action_write v7] carregado');
