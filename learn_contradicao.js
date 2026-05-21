// =============================================================================
// LEARN_CONTRADICAO.JS — Lab v7 - Raciocínio
//
// DETECTOR ATIVO DE CONTRADIÇÕES.
//
// FILOSOFIA:
//   action_write já detecta sobrescrita imediata (mesmo slot, novo valor).
//   Mas há contradições SEMÂNTICAS que escapam:
//
//   - "Maria é minha mãe"     → identity_fact (sujeito=user, predicado=mae, valor=maria)
//   - "Maria é minha esposa"  → identity_fact (sujeito=user, predicado=esposa, valor=maria)
//     ↑ NÃO é mesmo slot, mas é mutuamente exclusivo!
//
//   - "tenho 30 anos"  → corpo.idade=30
//   - "tenho 25 anos"  → conflito direto (sobrescrita), action_write resolve
//   - "tenho 30 anos"  → corpo.idade=30
//   - "sou criança"    → identidade.papel=crianca   ← CONTRADIÇÃO LATENTE
//
// COMO DETECTAR:
//   1. Grupos mutuamente exclusivos: ['mae','esposa','irma','filha'] do mesmo valor
//   2. Faixas etárias incompatíveis: idade=30 + papel=criança
//   3. Atributos físicos opostos: "olhos azuis" + "olhos verdes" em mesmo turno
//   4. Self vs user: "voce se chama X" + "eu me chamo X" (Self e User não podem ter mesmo nome)
//
// AÇÃO:
//   - cria contradiction node (type='contradiction')
//   - liga os dois fatos via aresta kind='contradiz'
//   - registra em STATE.contradicoes[] pra meditação revisar
//   - se severa, dispara action_ask pedindo esclarecimento
// =============================================================================

'use strict';

// Grupos de relações familiares mutuamente exclusivas
// (mesma pessoa não pode ser mãe e esposa do user)
const _GRUPOS_EXCLUSIVOS = [
  ['mae', 'mãe', 'esposa', 'mulher', 'filha', 'irma', 'irmã'],
  ['pai', 'marido', 'esposo', 'filho', 'irmao', 'irmão'],
];

// Predicados que aceitam valor único (só pode ter um)
const _SLOTS_UNICOS = ['nome', 'idade', 'altura', 'peso', 'profissao', 'profissão'];

// ============================================================
// DETECTA CONTRADIÇÕES depois de um write
// args = {
//   sujeito, predicado, valor, fato_node_id,
//   turnoInfo
// }
// Retorna: {contradicoes:[{nó1, nó2, tipo, severidade}]}
// ============================================================
function learnDetectarContradicao(args){
  const {sujeito, predicado, valor, fato_node_id, turnoInfo} = args;
  if(!sujeito || !valor) return {contradicoes: []};

  const contradicoes = [];

  // Pega todos os fatos do mesmo sujeito (exceto o que acabou de criar)
  const subjNode = _findSubjFC(sujeito);
  if(!subjNode) return {contradicoes: []};

  const fatosDoSujeito = STATE.nodes.filter(n =>
    (n.type === 'identity_fact' || n.type === 'identity_attr') &&
    !n._superseded &&
    n.id !== fato_node_id &&
    n._sujeito === sujeito
  );

  const novoFato = STATE.nodes.find(n => n.id === fato_node_id);

  for(const outro of fatosDoSujeito){
    const conflito = _detectarConflito(novoFato, outro);
    if(conflito){
      // Cria contradiction node
      const contraNode = makeNode({
        type:        'contradiction',
        layer:       'mantle',
        origin_type: 'INFERENCE',
        text:        `contradição: ${novoFato.text} ⊥ ${outro.text}`,
        mass:        1.5,
        energy:      2,
      });
      contraNode._tipo       = conflito.tipo;
      contraNode._severidade = conflito.severidade;   // 'baixa' | 'media' | 'alta'
      contraNode._fato_a     = novoFato.id;
      contraNode._fato_b     = outro.id;
      contraNode._turno_detectada = STATE.turn;
      contraNode._status     = 'pendente';
      STATE.nodes.push(contraNode);

      // Liga novoFato → contradiz → outro
      STATE.edges.push(makeEdge({
        a: novoFato.id, b: outro.id, w: 0.8, kind: 'contradiz'
      }));
      // Liga contraNode aos dois fatos
      STATE.edges.push(makeEdge({
        a: contraNode.id, b: novoFato.id, w: 0.7, kind: 'deriva_de'
      }));
      STATE.edges.push(makeEdge({
        a: contraNode.id, b: outro.id, w: 0.7, kind: 'deriva_de'
      }));

      // Registra em STATE.contradicoes
      if(!STATE.contradicoes) STATE.contradicoes = [];
      STATE.contradicoes.push({
        id:        contraNode.id,
        turno:     STATE.turn,
        tipo:      conflito.tipo,
        severidade:conflito.severidade,
        fato_a:    novoFato.id,
        fato_b:    outro.id,
        texto_a:   novoFato.text,
        texto_b:   outro.text,
        descricao: conflito.descricao,
        status:    'pendente',
      });

      contradicoes.push({
        nó1: novoFato, nó2: outro,
        tipo: conflito.tipo,
        severidade: conflito.severidade,
        descricao: conflito.descricao,
        contradiction_node_id: contraNode.id,
      });

      _addIterLogC(turnoInfo, 'warn',
        `contradição[${conflito.severidade}]: ${conflito.descricao}`,
        {tipo: conflito.tipo, fato_a: novoFato.id, fato_b: outro.id});
    }
  }

  return {contradicoes};
}

// ============================================================
// DETECTA CONFLITO específico entre dois fatos
// Retorna {tipo, severidade, descricao} ou null se não há conflito
// ============================================================
function _detectarConflito(a, b){
  if(!a || !b) return null;

  const pa = (a._predicado || '').toLowerCase();
  const pb = (b._predicado || '').toLowerCase();
  const va = String(a._valor || '').toLowerCase();
  const vb = String(b._valor || '').toLowerCase();

  // 1. RELAÇÕES FAMILIARES EXCLUSIVAS (mesma pessoa em papéis incompatíveis)
  for(const grupo of _GRUPOS_EXCLUSIVOS){
    if(grupo.includes(pa) && grupo.includes(pb) && pa !== pb){
      if(va === vb){
        return {
          tipo: 'relacao_familiar_exclusiva',
          severidade: 'alta',
          descricao: `"${va}" não pode ser ${pa} e ${pb} ao mesmo tempo`,
        };
      }
    }
  }

  // 2. SLOTS ÚNICOS — mesmo predicado com valor diferente JÁ é detectado pelo action_write
  //    (sobrescrita). Aqui detectamos quando NUM_ANTERIOR ainda está ativo
  //    (caso o action_write tenha falhado em marcar).
  if(pa === pb && va !== vb && _SLOTS_UNICOS.includes(pa)){
    return {
      tipo: 'slot_unico_valor_diferente',
      severidade: 'media',
      descricao: `${pa} já tinha valor "${vb}" e agora aparece "${va}"`,
    };
  }

  // 3. ATRIBUTOS FÍSICOS DUPLICADOS (mesmo predicado, valores diferentes ativos)
  // Diferente do caso 2: para atributos como "cor dos olhos" o sistema TENTA
  // sobrescrever, mas se houver dois ativos pelo mesmo predicado num intervalo curto,
  // isso é contradição
  const fisicos = ['cor_olhos', 'cor_cabelo', 'altura', 'peso'];
  if(pa === pb && va !== vb && fisicos.includes(pa)){
    const turnoA = a._turno || STATE.turn;
    const turnoB = b._turno || STATE.turn;
    if(Math.abs(turnoA - turnoB) <= 3){     // contradição imediata
      return {
        tipo: 'atributo_fisico_conflito',
        severidade: 'media',
        descricao: `${pa}: tem "${va}" e "${vb}" ativos`,
      };
    }
  }

  // 4. AGE x PAPEL incompatível (criança/adulto x idade)
  if((pa === 'idade' && pb === 'papel') || (pb === 'idade' && pa === 'papel')){
    const idade = parseInt(pa === 'idade' ? va : vb, 10);
    const papel = (pa === 'papel' ? va : vb).toLowerCase();
    if(!isNaN(idade)){
      if(idade >= 18 && (papel === 'crianca' || papel === 'criança' || papel === 'bebê' || papel === 'bebe')){
        return {tipo:'idade_x_papel', severidade:'alta',
                descricao:`idade ${idade} contradiz papel "${papel}"`};
      }
      if(idade < 13 && (papel === 'adulto' || papel === 'idoso')){
        return {tipo:'idade_x_papel', severidade:'alta',
                descricao:`idade ${idade} contradiz papel "${papel}"`};
      }
    }
  }

  return null;
}

function _findSubjFC(sujeito){
  if(sujeito === '__self__'){
    return STATE.nodes.find(n => n.id === '__SELF_CORE__');
  }
  return STATE.nodes.find(n =>
    (n.type === 'identity_user' || n.type === 'identity_pessoa') &&
    (n.text || '').toLowerCase() === String(sujeito).toLowerCase()
  );
}

// ============================================================
// LISTA CONTRADIÇÕES PENDENTES (pra meditação)
// ============================================================
function listContradicoesPendentes(){
  return (STATE.contradicoes || []).filter(c => c.status === 'pendente');
}

// ============================================================
// MARCA CONTRADIÇÃO COMO RESOLVIDA
// (chamado depois do user esclarecer ou meditação decidir)
// ============================================================
function resolverContradicao(contraId, qualMantem, motivo){
  const c = STATE.contradicoes?.find(x => x.id === contraId);
  if(!c) return false;
  c.status = 'resolvida';
  c.resolucao = {mantem: qualMantem, motivo, turno: STATE.turn};

  // Marca o que NÃO mantém como _superseded
  const descartar = qualMantem === c.fato_a ? c.fato_b : c.fato_a;
  const desc = STATE.nodes.find(n => n.id === descartar);
  if(desc){
    desc._superseded = true;
    desc.brightness = Math.max(0.1, (desc.brightness || 0.5) - 0.3);
  }
  // Atualiza contradiction node
  const contraNode = STATE.nodes.find(n => n.id === contraId);
  if(contraNode){
    contraNode._status = 'resolvida';
    contraNode._mantem = qualMantem;
    contraNode._motivo = motivo;
  }
  return true;
}

// ============================================================
// STATS
// ============================================================
function contradicaoStats(){
  const lista = STATE.contradicoes || [];
  return {
    total:        lista.length,
    pendentes:    lista.filter(c => c.status === 'pendente').length,
    resolvidas:   lista.filter(c => c.status === 'resolvida').length,
    severidade_alta:  lista.filter(c => c.severidade === 'alta' && c.status === 'pendente').length,
    severidade_media: lista.filter(c => c.severidade === 'media' && c.status === 'pendente').length,
  };
}

function _addIterLogC(turnoInfo, kind, descricao, dados){
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
window.learnDetectarContradicao  = learnDetectarContradicao;
window.listContradicoesPendentes = listContradicoesPendentes;
window.resolverContradicao       = resolverContradicao;
window.contradicaoStats          = contradicaoStats;

console.log('[learn_contradicao v7] carregado');
