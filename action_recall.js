// =============================================================================
// ACTION_RECALL.JS — Lab v7 - Raciocínio
//
// BUSCA via propagação na rede.
//
// FILOSOFIA:
//   Não é "SELECT * FROM dossier WHERE subject = X".
//   É: dispara pulso a partir do nó-sujeito, coleta fatos iluminados.
//   Quem tiver mais energia depois do pulso = mais "lembrado".
//
// USOS:
//   1. action_recall_subject(sujeito) → traz tudo que sabe sobre alguém
//   2. action_recall_attribute(sujeito, predicado) → traz o valor de um atributo específico
//   3. action_recall_facts() → traz todos os identity_fact recentes
//
// SAÍDA:
//   {
//     fatos: [{node, energia, predicado, valor}],
//     texto: "seu nome é Douglas\nseus olhos são azuis\n...",
//     recall_node_id: 'n_...',  // action_recall node criado
//   }
// =============================================================================

'use strict';

// ============================================================
// RECALL DE SUJEITO — "o que sabe sobre douglas"
// ============================================================
function actionRecallSubject(sujeito, turnoInfo, userInputNodeId){
  // Acha o nó-sujeito (identity_user/identity_self)
  const subjNode = _findSubjectNode(sujeito);

  // Cria nó action_recall
  const recallNode = makeNode({
    type:        'action_recall',
    layer:       'parse',
    origin_type: 'SYSTEM',
    text:        'recall(' + sujeito + ')',
    mass:        1,
    fire_id:     nextFireId(),
  });
  STATE.nodes.push(recallNode);
  if(userInputNodeId){
    STATE.edges.push(makeEdge({
      a: userInputNodeId, b: recallNode.id, w: 0.5, kind: 'sequence'
    }));
  }

  if(!subjNode){
    _addIterLogR(turnoInfo, 'warn',
      `recall: sujeito "${sujeito}" não existe na rede ainda`, {sujeito});
    return {fatos: [], texto: '', recall_node_id: recallNode.id, subj_node_id: null};
  }

  // Dispara pulso a partir do sujeito
  const res = propagatePulse([subjNode.id], {
    pulse_initial: 50,   // pulso menor que o normal — buscando, não criando
    max_hops:      3,    // não vai muito longe
  });

  // Coleta fatos iluminados ligados ao sujeito
  const lit = getLitNodes(res.activated, 2);
  const fatos = [];

  for(const l of lit){
    const n = l.node;
    if(n.id === subjNode.id) continue;
    // Tipos que contam como "fato":
    if(n.type === 'identity_fact' || n.type === 'identity_attr'){
      // Tem aresta direta com o sujeito?
      const ligado = STATE.edges.some(e =>
        (e.a === n.id && e.b === subjNode.id) ||
        (e.b === n.id && e.a === subjNode.id)
      );
      if(ligado){
        fatos.push({
          node:      n,
          energia:   l.energy,
          predicado: n._predicado || '?',
          valor:     n._valor || n.text,
        });
      }
    }
  }

  // Liga recall → cada fato encontrado
  for(const f of fatos){
    STATE.edges.push(makeEdge({
      a: recallNode.id, b: f.node.id, w: 0.4, kind: 'deriva_de'
    }));
  }

  // Também consulta o dossiê tradicional (espelho do que está na rede)
  const dossier = STATE.dossiers[sujeito] || {};
  const linhasDossier = _formatDossier(sujeito, dossier);

  // Auto-info do Self
  let linhasSelf = [];
  if(sujeito === '__self__'){
    linhasSelf = _formatSelfDossier(STATE.selfDossier);
  }

  // Monta texto humano
  const linhasFatos = fatos
    .sort((a, b) => b.energia - a.energia)
    .map(f => _formatFatoNode(f.node, sujeito));

  const linhas = [...new Set([...linhasDossier, ...linhasSelf, ...linhasFatos])];
  const texto = linhas.length > 0
    ? linhas.join('\n')
    : `ainda não sei nada sobre ${_displaySujeito(sujeito)}.`;

  _addIterLogR(turnoInfo, 'infer',
    `recall: ${fatos.length} fato(s) iluminado(s) + ${linhasDossier.length} do dossiê para "${sujeito}"`,
    {sujeito, fatos: fatos.length, linhas});

  return {fatos, texto, recall_node_id: recallNode.id, subj_node_id: subjNode.id};
}

// ============================================================
// RECALL DE ATRIBUTO ESPECÍFICO — "qual a cor dos olhos?"
// ============================================================
function actionRecallAttribute(sujeito, predicado, turnoInfo, userInputNodeId){
  // Vai usar o mesmo motor de propagação, mas filtra pelo predicado
  const r = actionRecallSubject(sujeito, turnoInfo, userInputNodeId);
  const matches = r.fatos.filter(f =>
    f.predicado === predicado ||
    (f.node.text || '').toLowerCase().includes((predicado || '').toLowerCase())
  );
  return {fatos: matches, texto: matches.map(f => f.valor).join(', ') || null};
}

// ============================================================
// HELPERS
// ============================================================
function _findSubjectNode(sujeito){
  if(sujeito === '__self__'){
    return STATE.nodes.find(n => n.id === '__SELF_CORE__');
  }
  // tenta achar identity_user com text==sujeito
  let n = STATE.nodes.find(x =>
    (x.type === 'identity_user' || x.type === 'identity_pessoa') &&
    (x.text || '').toLowerCase() === String(sujeito).toLowerCase()
  );
  if(n) return n;
  // fallback: qualquer nó com text == sujeito
  return STATE.nodes.find(x => (x.text || '').toLowerCase() === String(sujeito).toLowerCase()) || null;
}

function _formatDossier(sujeito, dossier){
  const out = [];
  const d = dossier || {};

  if(d.identidade?.nome)    out.push(`seu nome é ${d.identidade.nome}`);
  if(d.identidade?.apelido) out.push(`seu apelido é ${d.identidade.apelido}`);
  if(d.identidade?.papel)   out.push(`você ${_verboPapel(d.identidade.papel)}`);

  if(Array.isArray(d.corpo?.partes)){
    for(const p of d.corpo.partes) out.push(`você tem ${p}`);
  }
  if(d.corpo?.cor_olhos) out.push(`seus olhos são ${d.corpo.cor_olhos}`);

  if(Array.isArray(d.preferencias?.gosta)){
    for(const g of d.preferencias.gosta) out.push(`gosta de ${g}`);
  }
  if(Array.isArray(d.preferencias?.nao_gosta)){
    for(const g of d.preferencias.nao_gosta) out.push(`não gosta de ${g}`);
  }
  if(Array.isArray(d.conhecimento?.sabe_sobre) && d.conhecimento.sabe_sobre.length){
    out.push(`sabe sobre ${d.conhecimento.sabe_sobre.join(', ')}`);
  }

  return out;
}

function _formatSelfDossier(self){
  const out = [];
  if(self?.nome)    out.push(`meu nome é ${self.nome}`);
  if(self?.apelido) out.push(`meu apelido é ${self.apelido}`);
  return out;
}

function _formatFatoNode(n, sujeito){
  // Fato em rede pode ter _predicado e _valor (formato canônico)
  if(n._predicado && n._valor){
    return `${_displaySujeito(sujeito)} ${n._predicado}: ${n._valor}`;
  }
  return n.text || '(fato sem texto)';
}

function _displaySujeito(s){
  if(s === '__self__') return 'eu';
  return s || '?';
}

function _verboPapel(p){
  if(p === 'trabalho' || p === 'estudo') return p;
  if((p || '').includes('trabalho')) return p;
  return 'é ' + p;
}

function _addIterLogR(turnoInfo, kind, descricao, dados){
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
window.actionRecallSubject   = actionRecallSubject;
window.actionRecallAttribute = actionRecallAttribute;

console.log('[action_recall v7] carregado');
