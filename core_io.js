// =============================================================================
// CORE_IO.JS — Lab v7 - Raciocínio
//
// Persistência completa do estado.
//
// MUDANÇAS v7:
//   - Nome do arquivo: nerel_lab_v7_*.json  (não mais v5!)
//   - Campo v: LAB_VERSION (7)
//   - Importa v5 e v6 com migração automática (achata listas, purga sinônimos,
//     converte schema antigo pro novo)
//   - Export inclui iterations[] e logic_chains[]
//   - Botão "ANÁLISE" exporta um JSON detalhado pra você analisar erros
// =============================================================================

'use strict';

// ============================================================
// EXPORT — salva tudo, v7
// ============================================================
function exportState(){
  const data = {
    v:           LAB_VERSION,
    labName:     LAB_NAME,
    savedAt:     new Date().toISOString(),
    SCHEMA:      window.SCHEMA,
    physics:     PHYSICS,

    // dossiês
    dossiers:    STATE.dossiers,
    selfDossier: STATE.selfDossier,
    activeSubject: STATE.activeSubject,
    turn:        STATE.turn,
    lastTurn:    STATE.lastTurn,
    askedGaps:   [...STATE.askedGaps],
    pendingClarify: STATE.pendingClarify,

    // sessão
    session_atual: STATE.session_atual,
    bootedAt:      STATE.bootedAt,

    // rede
    nodes:       STATE.nodes,
    edges:       STATE.edges,
    fusions:     STATE.fusions,

    // fantasmas e propostas
    ghosts:        STATE.ghosts,
    ghostsCreated: STATE.ghostsCreated,
    meditPropostas: STATE.meditPropostas,

    // linguagem
    synonyms:    STATE.synonyms,
    definitions: STATE.definitions,
    tomEstilo:   STATE.tomEstilo,

    // iterações e cadeias lógicas (NOVO v7)
    iterations:  STATE.iterations,
    logic_chains: STATE.logic_chains,
    next_fire_id: STATE.next_fire_id,

    // seed
    seedMeta:    STATE.seed,

    // UI snapshot
    chatHtml:    $('chat')?.innerHTML || '',
    logHtml:     $('logWrap')?.innerHTML || '',
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nerel_lab_v${LAB_VERSION}_${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log(`[io v${LAB_VERSION}] estado exportado`);
}

// ============================================================
// EXPORT ANÁLISE — dump completo pra estudo
// Inclui: estado + iterações detalhadas + estrutura da rede + log de erros
// ============================================================
function exportAnalysis(){
  const agora = new Date().toISOString();

  // Estatísticas detalhadas
  const stats = {
    versao: LAB_VERSION,
    capturadoEm: agora,

    rede: {
      total_nodes: STATE.nodes.length,
      total_edges: STATE.edges.length,
      por_type:    _contarPorCampo('type'),
      por_layer:   _contarPorCampo('layer'),
      por_origin:  _contarPorCampo('origin_type'),
      por_edge_kind: _contarEdgePorCampo('kind'),
      super_nodes: STATE.nodes.filter(n => n.is_super).length,
      provisorios: STATE.nodes.filter(n => n._provisional).length,
      hipoteses:   STATE.nodes.filter(n => n._hypothesis).length,
    },

    massas: {
      max:    Math.max(0, ...STATE.nodes.map(n => n.mass || 0)),
      min:    Math.min(...STATE.nodes.map(n => n.mass || 0).concat([0])),
      total:  STATE.nodes.reduce((s, n) => s + (n.mass || 0), 0),
      acima_critica: STATE.nodes.filter(n => (n.mass || 0) > PHYSICS.MASSA_CRITICA).length,
    },

    pesos: {
      max:    Math.max(0, ...STATE.edges.map(e => e.w || 0)),
      min:    Math.min(...STATE.edges.map(e => e.w || 0).concat([1])),
      medio:  STATE.edges.length > 0
              ? STATE.edges.reduce((s, e) => s + (e.w || 0), 0) / STATE.edges.length
              : 0,
    },

    iteracoes: {
      total_turnos: STATE.iterations.length,
      convergiram: STATE.iterations.filter(i => i.convergiu).length,
      tempo_medio_ms: STATE.iterations.length > 0
                      ? STATE.iterations.reduce((s, i) => s + (i.tempo_ms || 0), 0) / STATE.iterations.length
                      : 0,
      iter_max:     Math.max(0, ...STATE.iterations.map(i => i.iteracoes?.length || 0)),
    },

    cadeias_logicas: {
      total: STATE.logic_chains.length,
      marcadas_boa:  STATE.logic_chains.filter(c => c.marcada === 'boa').length,
      marcadas_ruim: STATE.logic_chains.filter(c => c.marcada === 'ruim').length,
      por_tipo: _contarCadeiasPorTipo(),
    },
  };

  // Diagnóstico de problemas conhecidos
  const diagnostico = [];

  // 1. Núcleos órfãos (sem nenhuma aresta)
  const orfaos = STATE.nodes.filter(n => {
    if(n.type === 'identity_self') return false;
    return !STATE.edges.some(e => e.a === n.id || e.b === n.id);
  });
  if(orfaos.length > 0){
    diagnostico.push({
      problema: 'núcleos órfãos (sem conexões)',
      quantidade: orfaos.length,
      exemplos: orfaos.slice(0, 5).map(n => ({id: n.id, type: n.type, text: (n.text || '').slice(0, 60)})),
    });
  }

  // 2. Etiquetas provisórias pendentes
  const provs = STATE.nodes.filter(n => n._provisional);
  if(provs.length > 0){
    diagnostico.push({
      problema: 'etiquetas provisórias aguardando consolidação',
      quantidade: provs.length,
      acao_sugerida: 'meditação ou confirmação manual',
      exemplos: provs.slice(0, 5).map(n => ({id: n.id, type: n.type, text: (n.text || '').slice(0, 60)})),
    });
  }

  // 3. Cadeias lógicas marcadas como ruins (precisam ser revisadas)
  const ruins = STATE.logic_chains.filter(c => c.marcada === 'ruim');
  if(ruins.length > 0){
    diagnostico.push({
      problema: 'cadeias lógicas marcadas como ruins',
      quantidade: ruins.length,
      acao_sugerida: 'analisar por que erraram',
      cadeias: ruins.slice(0, 10).map(c => ({
        id: c.id, turno: c.turno, tipo: c.tipo, sequencia_len: c.sequencia.length,
      })),
    });
  }

  // 4. Arestas com peso muito baixo (quase mortas)
  const fracas = STATE.edges.filter(e => e.w < 0.1).length;
  if(fracas > 10){
    diagnostico.push({
      problema: 'arestas com peso muito baixo',
      quantidade: fracas,
      acao_sugerida: 'meditação pode fundir ou descartar',
    });
  }

  // 5. Sessões cresceram sem terminar?
  const sessoes = new Set(STATE.nodes.map(n => n.session_id).filter(Boolean));
  if(sessoes.size > 5){
    diagnostico.push({
      problema: 'muitas sessões no estado',
      quantidade: sessoes.size,
      acao_sugerida: 'considerar consolidar sessões antigas em cristais',
    });
  }

  const analise = {
    metadata: {
      versao_lab: LAB_VERSION,
      lab_name: LAB_NAME,
      timestamp: agora,
      session_atual: STATE.session_atual,
    },
    estatisticas: stats,
    diagnostico: diagnostico,
    iteracoes_recentes: STATE.iterations.slice(-10),
    cadeias_recentes:   STATE.logic_chains.slice(-10),
    estado_completo:    {
      nodes: STATE.nodes,
      edges: STATE.edges,
      dossiers: STATE.dossiers,
      selfDossier: STATE.selfDossier,
      synonyms: STATE.synonyms,
      definitions: STATE.definitions,
    },
  };

  const blob = new Blob([JSON.stringify(analise, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lab_v${LAB_VERSION}_ANALISE_${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log('[io v7] análise exportada com', diagnostico.length, 'problemas detectados');
}

function _contarPorCampo(campo){
  const c = {};
  for(const n of STATE.nodes){
    const k = n[campo] || '?';
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

function _contarEdgePorCampo(campo){
  const c = {};
  for(const e of STATE.edges){
    const k = e[campo] || '?';
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

function _contarCadeiasPorTipo(){
  const c = {};
  for(const ch of STATE.logic_chains){
    const k = ch.tipo || '?';
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

// ============================================================
// IMPORT — carrega estado v5/v6/v7 com migração automática
// ============================================================
function importStateFromObject(data){
  if(!data || typeof data !== 'object') throw new Error('JSON inválido');

  const versaoOriginal = data.v || 'desconhecida';
  const avisos = [];

  // SCHEMA volta ao seed e mescla
  window.resetSchema();
  if(data.SCHEMA){
    for(const g of Object.keys(data.SCHEMA)){
      if(!window.SCHEMA[g]) window.SCHEMA[g] = {};
      Object.assign(window.SCHEMA[g], data.SCHEMA[g]);
    }
  }

  STATE.dossiers      = data.dossiers      || {};
  STATE.selfDossier   = data.selfDossier   || {};
  STATE.activeSubject = data.activeSubject || null;
  STATE.turn          = data.turn          || 0;
  STATE.lastTurn      = data.lastTurn      || null;
  STATE.askedGaps     = new Set(data.askedGaps || []);
  STATE.pendingClarify= data.pendingClarify|| null;
  STATE.session_atual = data.session_atual || newSessionId();

  STATE.nodes         = data.nodes         || [];
  STATE.edges         = data.edges         || [];
  STATE.fusions       = data.fusions       || 0;
  STATE.ghosts        = data.ghosts        || [];
  STATE.ghostsCreated = data.ghostsCreated || 0;
  STATE.meditPropostas = data.meditPropostas || [];

  STATE.synonyms      = data.synonyms      || {};
  STATE.definitions   = data.definitions   || {};
  STATE.tomEstilo     = data.tomEstilo     || 'neutro';

  STATE.iterations    = data.iterations    || [];
  STATE.logic_chains  = data.logic_chains  || [];
  STATE.next_fire_id  = data.next_fire_id  || 1;

  if(data.seedMeta || data.baseMeta){
    STATE.seed = {
      loaded: true,
      loadedAt: (data.seedMeta && data.seedMeta.loadedAt) || (data.baseMeta && data.baseMeta.loadedAt),
      nucleosSeed: (data.seedMeta && data.seedMeta.nucleosSeed) || (data.baseMeta && data.baseMeta.nucleosBaseIds) || [],
    };
  }

  if(data.chatHtml && $('chat'))      $('chat').innerHTML    = data.chatHtml;
  if(data.logHtml  && $('logWrap'))   $('logWrap').innerHTML = data.logHtml;
  if(data.thinkHtml && $('logWrap'))  $('logWrap').innerHTML = data.thinkHtml;   // compat v6

  // ===== MIGRAÇÃO v5/v6 → v7 =====

  // 1. Purgar sinônimos inválidos (herança v5)
  if(window.purgarSinonimosInvalidos){
    const removidos = window.purgarSinonimosInvalidos();
    if(removidos > 0) avisos.push(`${removidos} sinônimo(s) inválido(s) removido(s)`);
  }

  // 2. Achatar listas bagunçadas (v5 acumulou [[a,b],[a,b]])
  if(window._flattenDedupe){
    let listasCorrigidas = 0;
    for(const subj of Object.keys(STATE.dossiers)){
      const d = STATE.dossiers[subj] || {};
      for(const grp of Object.keys(d)){
        for(const key of Object.keys(d[grp] || {})){
          const v = d[grp][key];
          if(Array.isArray(v)){
            const flat = window._flattenDedupe(v);
            if(JSON.stringify(flat) !== JSON.stringify(v)){
              d[grp][key] = flat;
              listasCorrigidas++;
            }
          }
        }
      }
    }
    if(listasCorrigidas > 0) avisos.push(`${listasCorrigidas} lista(s) achatada(s)/deduplicada(s)`);
  }

  // 3. Migra núcleos v5/v6 pra v7 (campos novos)
  let migrados = 0;
  for(const n of STATE.nodes){
    let m = false;
    if(!n.layer){
      n.layer = (window.defaultLayerForType ? window.defaultLayerForType(n.type) : 'surface');
      m = true;
    }
    if(!n.origin_type){
      // Heurística de origem por type/source antigo
      if(n._base || n.source === 'base')       n.origin_type = 'BOOT_V7';
      else if(n.source === 'absorption')       n.origin_type = 'BOOK';
      else if(n.type === 'msg' && n.source === 'user') n.origin_type = 'CHAT';
      else if(n.type === 'msg' && n.source === 'ai')   n.origin_type = 'GENERATED';
      else                                     n.origin_type = 'SYSTEM';
      m = true;
    }
    if(!n.pos && window.defaultLayerForType){
      // Cria posição padrão pra core
      n.pos = [0, 0, 0];
      m = true;
    }
    if(n.text === undefined && n.txt !== undefined){ n.text = n.txt; m = true; }
    if(n.parent_id === undefined)  { n.parent_id  = null; m = true; }
    if(n.session_id === undefined) { n.session_id = null; m = true; }
    if(n.fire_id === undefined)    { n.fire_id    = null; m = true; }
    if(n.molecule_id === undefined){ n.molecule_id= null; m = true; }
    if(n.is_anchor === undefined)  { n.is_anchor  = 0;    m = true; }
    if(n.is_super === undefined)   { n.is_super   = 0;    m = true; }
    if(n.brightness === undefined) { n.brightness = 0.5;  m = true; }
    if(m) migrados++;
  }
  if(migrados > 0) avisos.push(`${migrados} núcleo(s) migrado(s) para schema v${LAB_VERSION}`);

  // 4. Migra type-names v5/v6 → v7
  let renomados = 0;
  for(const n of STATE.nodes){
    if(n.type === 'msg' && n.source === 'user')  { n.type = 'user_input'; renomados++; }
    else if(n.type === 'msg' && n.source === 'ai'){ n.type = 'generated_msg'; renomados++; }
    else if(n.type === 'msg-base')               { n.type = 'book'; renomados++; }
    else if(n.type === 'self_core')              { n.type = 'identity_self'; renomados++; }
    else if(n.type === 'self_attr')              { n.type = 'identity_attr'; renomados++; }
    else if(n.type === 'fact')                   { n.type = 'identity_fact'; renomados++; }
    else if(n.type === 'concept')                { n.type = 'book_concept'; renomados++; }
  }
  if(renomados > 0) avisos.push(`${renomados} tipo(s) renomado(s) para vocabulário v7`);

  // 5. Avisar se versão original era anterior a v7
  if(versaoOriginal !== LAB_VERSION && versaoOriginal !== String(LAB_VERSION)){
    avisos.push(`JSON original v${versaoOriginal} → migrado para v${LAB_VERSION}`);
  }

  console.log(`[io v${LAB_VERSION}] estado importado`, {
    versao_origem: versaoOriginal,
    turno: STATE.turn,
    nodes: STATE.nodes.length,
    edges: STATE.edges.length,
    dossiers: Object.keys(STATE.dossiers).length,
    avisos,
  });

  return {avisos, versaoOriginal};
}

async function importStateFromFile(file){
  const txt = await file.text();
  const data = JSON.parse(txt);
  const result = importStateFromObject(data);
  if(window.renderDossier)    window.renderDossier();
  if(window.updateStats)      window.updateStats();
  if(window.renderLogPanel)   window.renderLogPanel();
  return result;
}

// ============================================================
// RESET — zera tudo (mas guarda seed se reaplicada)
// ============================================================
function resetState(opts){
  opts = opts || {};
  const manterSeed = opts.manterSeed !== false;

  window.resetSchema();
  STATE.dossiers      = {};
  STATE.selfDossier   = {};
  STATE.activeSubject = null;
  STATE.turn          = 0;
  STATE.lastTurn      = null;
  STATE.askedGaps     = new Set();
  STATE.pendingClarify= null;
  STATE.synonyms      = {};
  STATE.definitions   = {};
  STATE.tomEstilo     = 'neutro';
  STATE.fusions       = 0;
  STATE.ghosts        = [];
  STATE.ghostsCreated = 0;
  STATE.meditPropostas= [];
  STATE.lastMedit     = 0;
  STATE.iterations    = [];
  STATE.logic_chains  = [];
  STATE.next_fire_id  = 1;
  STATE.session_atual = newSessionId();

  if(manterSeed){
    const idsSeed = new Set(STATE.seed.nucleosSeed || []);
    STATE.nodes = STATE.nodes.filter(n => idsSeed.has(n.id));
    STATE.edges = STATE.edges.filter(e => idsSeed.has(e.a) && idsSeed.has(e.b));
  } else {
    STATE.nodes = [];
    STATE.edges = [];
    STATE.seed.nucleosSeed = [];
  }

  if($('chat'))    $('chat').innerHTML    = `<div class="msg sys">— rede zerada — diga oi —</div>`;
  if($('logWrap')) $('logWrap').innerHTML = '';

  if(window.renderDossier)  window.renderDossier();
  if(window.updateStats)    window.updateStats();
  console.log(`[io v${LAB_VERSION}] reset (manterSeed=${manterSeed})`);
}

// ============================================================
// EXPOR
// ============================================================
window.exportState           = exportState;
window.exportAnalysis        = exportAnalysis;
window.importStateFromObject = importStateFromObject;
window.importStateFromFile   = importStateFromFile;
window.resetState            = resetState;

console.log(`[core_io v${LAB_VERSION}] carregado`);
