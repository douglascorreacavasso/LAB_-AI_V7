// =============================================================================
// CORE_STATE.JS — Lab v7 - Raciocínio
//
// Estado global. TUDO que persiste vive aqui.
//
// MUDANÇAS v7 vs v6:
//   - Constante LAB_VERSION = 7 (única fonte de verdade, exportada em todo lugar)
//   - Núcleos têm pos[x,y,z] (3D real nos dados, não no visual)
//   - Núcleos têm layer (surface/mantle/core/exec/parse/decisao/orquestrador/write/wait)
//   - Núcleos têm origin_type (CHAT/USER/BOOK/GENERATED/SYSTEM/...)
//   - Núcleos têm parent_id, session_id, fire_id, molecule_id
//   - Núcleos têm is_anchor, is_super
//   - STATE.session_atual com session_id da conversa corrente
//   - STATE.iterations[] guarda o log iteração-por-iteração do motor
//   - STATE.logic_chains[] guarda as cadeias de raciocínio
//   - STATE.physics traz constantes oficiais (alpha, beta, max_hops, pulso, etc)
// =============================================================================

'use strict';

// ============================================================
// VERSÃO — única fonte de verdade
// ============================================================
const LAB_VERSION = 7;
const LAB_NAME    = 'Lab v7 - Raciocínio';

// ============================================================
// SCHEMA DE DOSSIÊ (continua existindo — é a "tabela de slots" do dossiê)
// A rede de núcleos é a fonte real; o dossiê é uma projeção legível.
// ============================================================
const SCHEMA_SEED = {
  identidade: {
    nome:     { type:'single', label:'nome do usuário' },
    apelido:  { type:'single', label:'apelido' },
    papel:    { type:'single', label:'papel/profissão' }
  },
  self: {
    nome:     { type:'single', label:'nome dela (AI)' },
    apelido:  { type:'single', label:'apelido dela' }
  },
  corpo: {
    cor_olhos:{ type:'single', label:'cor dos olhos' },
    partes:   { type:'list',   label:'partes do corpo' }
  },
  preferencias: {
    gosta:    { type:'list',   label:'gosta de' },
    nao_gosta:{ type:'list',   label:'não gosta de' }
  },
  conhecimento: {
    sabe_sobre:{ type:'list',  label:'sabe sobre' }
  }
};

let SCHEMA = JSON.parse(JSON.stringify(SCHEMA_SEED));

// ============================================================
// CONSTANTES DE FÍSICA (Suma Teológica §5.1)
// Estas são as MESMAS do ARCH-NEURAL real. NÃO MUDAR sem motivo.
// ============================================================
const PHYSICS = Object.freeze({
  // Propagação de pulso (fórmula oficial: E_transf = E_origem × β × peso × α^hop)
  ALPHA:            0.95,   // decaimento por hop
  BETA:             0.20,   // fração que sai a cada hop
  MAX_HOPS:         6,      // profundidade máxima do BFS
  PULSO_INICIAL:    100,    // energia inicial de um pulso novo
  THRESHOLD_TRANSF: 2,      // abaixo disso, energia para
  THRESHOLD_LIT:    3,      // núcleo "iluminado" se passou disso

  // Massa e ideias
  MASSA_CRITICA:    100,    // mass > 100 → vira "ideia" (super-núcleo)
  MIN_CONEX_IDEIA:  3,      // pra virar ideia, precisa de N conexões

  // Ponte de Luz (consolidação)
  BRIDGE_DELTA:     0.02,   // aresta usada ganha +0.02 de peso
  WEIGHT_MAX:       1.0,    // teto de peso de aresta
  WEIGHT_MIN:       0.05,   // arestas abaixo disso não propagam

  // Decaimento por tempo (Paradoxo da Supermassa §4.6)
  LAMBDA:           0.01,   // decaimento de massa por dia sem acesso
  DECAY_DAYS:       90,     // depois disso, decay acelera

  // Penalidade por erro (Matemática da Dor §4.3)
  PAIN_ALPHA:       0.15,   // sensibilidade à dor
  PAIN_BETA:        0.30,   // curva de aprendizado

  // Self-Core
  SELF_RETURNS_ZERO: true,  // Self doa energia e volta a 0 (v5 F5)

  // Limites de segurança
  MAX_NUCLEI_PULSE: 5000,   // teto de núcleos tocados por pulso
  MAX_ITERATIONS:   30,     // teto de iterações do motor de convergência

  // Posicionamento 3D inicial (gravidade simbólica por layer)
  LAYER_RADIUS: {
    core:           20,
    mantle:         60,
    surface:        120,
    exec:           80,   // ações ficam em órbitas próprias
    parse:          80,
    decisao:        80,
    orquestrador:   80,
    write:          80,
    wait:           80,
  },
});

// ============================================================
// STATE GLOBAL
// ============================================================
const STATE = {
  // ---- metadados ----
  version:       LAB_VERSION,
  bootedAt:      null,             // setado em boot
  session_atual: null,             // session_id da conversa corrente

  // ---- dossiê (projeção legível) ----
  dossiers:      {},
  selfDossier:   {},
  activeSubject: null,
  turn:          0,
  lastTurn:      null,
  askedGaps:     new Set(),
  pendingClarify:null,

  // ---- rede viva (a fonte real) ----
  nodes:         [],               // cada node: {id, type, layer, pos, energy, mass, ...}
  edges:         [],
  fusions:       0,

  // ---- núcleos fantasma (propostas curtas) ----
  ghosts:        [],
  ghostsCreated: 0,

  // ---- propostas de meditação (longas, aguardam aceitação) ----
  meditPropostas: [],

  // ---- linguagem ----
  synonyms:      {},
  definitions:   {},
  tomEstilo:     'neutro',

  // ---- iterações do motor de convergência ----
  // Cada item: {turno, iteracoes:[{n, descricao, nodes_criados, edges_criadas, ...}], convergiu, tempo_ms}
  iterations:    [],

  // ---- cadeias lógicas (logic_chain) ----
  // Cada cadeia: {id, turno, sequencia:[node_ids...], tipo, marcada:'boa'|'ruim'|null}
  logic_chains:  [],

  // ---- contadores de fire (pra ações que disparam) ----
  next_fire_id:  1,

  // ---- meditação ----
  meditCooldown: 5,
  lastMedit:     0,

  // ---- snapshot da seed (pra reset preservar) ----
  seed: {
    loaded:      false,
    loadedAt:    null,
    nucleosSeed: [],   // IDs dos núcleos da seed
  },
};

// ============================================================
// UTILS — usadas por todos os módulos
// ============================================================
const $ = id => document.getElementById(id);

function uid(p='n'){ return p + '_' + Math.random().toString(36).slice(2,9); }
function nowT(){ return Date.now(); }
function ts(){ return new Date().toTimeString().slice(0,8); }
function cap(s){ return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }

function norm(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[!?.,;:¡¿"'()\[\]]+/g,' ').replace(/\s+/g,' ').trim();
}

const STOPWORDS = new Set([
  'de','da','do','das','dos','a','o','e','é','ou','um','uma','que','se','no','na','em','com',
  'pra','pro','para','por','sou','meu','minha','seu','sua','isso','esse','essa','isto','este','esta',
  'aqui','ali','la','sim','nao','não'
]);

function tokens(s){
  return norm(s).split(' ').filter(w => {
    if(!w) return false;
    if(STOPWORDS.has(w)) return false;
    // Preserva dígitos e operadores matemáticos mesmo sendo length=1
    if(/^[0-9]+(\.[0-9]+)?$/.test(w)) return true;
    if(/^[+\-*/=÷×]$/.test(w)) return true;
    // Senão, só palavras com length > 1
    return w.length > 1;
  });
}

function jaccard(a, b){
  const sa = new Set(a), sb = new Set(b);
  if(!sa.size || !sb.size) return 0;
  let inter = 0;
  for(const t of sa) if(sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// ID novo de sessão (a cada boot ou reset, gera novo)
function newSessionId(){
  return 'session_' + Math.floor(nowT() / 1000) + '_' + Math.random().toString(36).slice(2,6);
}

// ID de fire (sequencial dentro da sessão)
function nextFireId(){
  const id = 'fire_' + STATE.next_fire_id;
  STATE.next_fire_id++;
  return id;
}

// ============================================================
// HELPERS PARA NÚCLEOS — criar e validar com schema v7
// ============================================================

// Cria um núcleo já com todos os campos v7 preenchidos com defaults sensatos.
// Use este helper SEMPRE pra garantir que nenhum campo fica faltando.
function makeNode(opts){
  opts = opts || {};
  const n = {
    // identidade
    id:           opts.id           || uid('n'),
    type:         opts.type         || 'unknown',     // ver core_types.js
    layer:        opts.layer        || 'surface',     // ver PHYSICS.LAYER_RADIUS
    origin_type:  opts.origin_type  || 'SYSTEM',      // ver core_types.js
    source:       opts.source       || 'user_input',

    // texto/conteúdo
    text:         opts.text         || opts.txt || '',
    tokens:       opts.tokens       || (opts.text ? tokens(opts.text) : []),

    // relações (espelha o sistema real)
    parent_id:    opts.parent_id    || null,
    session_id:   opts.session_id   || STATE.session_atual,
    fire_id:      opts.fire_id      || null,
    molecule_id:  opts.molecule_id  || null,
    is_anchor:    opts.is_anchor    || 0,
    is_super:     opts.is_super     || 0,

    // posição 3D — calculada por gravidade simbólica por layer
    pos:          opts.pos          || _positionByLayer(opts.layer || 'surface'),

    // física
    energy:       opts.energy       !== undefined ? opts.energy : 0,
    mass:         opts.mass         !== undefined ? opts.mass   : 1.0,
    brightness:   opts.brightness   !== undefined ? opts.brightness : 0.5,

    // timestamps
    createdAt:    opts.createdAt    || nowT(),
    lastAccessed: opts.lastAccessed || nowT(),

    // flags estendidos (qualquer um pode marcar)
    _seed:        opts.seed         || false,
    _base:        opts.base         || false,
    _provisional: opts.provisional  || false,   // etiqueta provisória inventada
    _hypothesis:  opts.hypothesis   || false,

    // visualização (calculado pelo render)
    vx: 0, vy: 0,
    x:  undefined, y: undefined,   // 2D projetado (preenchido pelo canvas)
  };
  return n;
}

// Posição 3D inicial baseada na camada (gravidade simbólica)
// Core ao centro. Surface bem fora. Layers de ação em órbitas próprias.
function _positionByLayer(layer){
  const r = PHYSICS.LAYER_RADIUS[layer] || PHYSICS.LAYER_RADIUS.surface;

  // Layers de ação ficam num "anel" separado (em z positivo)
  const isAction = ['exec','parse','decisao','orquestrador','write','wait'].includes(layer);

  // Ângulo aleatório no plano XY
  const theta = Math.random() * Math.PI * 2;
  const phi = isAction
    ? Math.PI * 0.3 + Math.random() * Math.PI * 0.4   // ações vivem num cone superior
    : Math.acos(2 * Math.random() - 1);               // outros distribuem uniformemente

  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  ];
}

// Cria uma aresta com defaults v7
function makeEdge(opts){
  opts = opts || {};
  return {
    a:         opts.a,
    b:         opts.b,
    w:         opts.w !== undefined ? opts.w : 0.2,
    kind:      opts.kind || 'co-occur',   // co-occur, hebbian, self_link, sequence, refere_a, é_tipo_de, etc.
    uses:      opts.uses !== undefined ? opts.uses : 0,
    lastUsed:  opts.lastUsed || nowT(),
    _seed:     opts.seed || false,
    _base:     opts.base || false,
    _lit:      false,   // marcado durante pulso pra render
  };
}

// ============================================================
// EXPOR
// ============================================================
window.LAB_VERSION = LAB_VERSION;
window.LAB_NAME    = LAB_NAME;
window.PHYSICS     = PHYSICS;
window.SCHEMA_SEED = SCHEMA_SEED;
window.SCHEMA      = SCHEMA;
window.STATE       = STATE;
window.$           = $;
window.uid         = uid;
window.nowT        = nowT;
window.ts          = ts;
window.cap         = cap;
window.norm        = norm;
window.STOPWORDS   = STOPWORDS;
window.tokens      = tokens;
window.jaccard     = jaccard;
window.escapeHtml  = escapeHtml;
window.pick        = pick;
window.newSessionId = newSessionId;
window.nextFireId  = nextFireId;
window.makeNode    = makeNode;
window.makeEdge    = makeEdge;

window.resetSchema = function(){
  window.SCHEMA = JSON.parse(JSON.stringify(SCHEMA_SEED));
};

console.log('[core_state v7] carregado — LAB_VERSION =', LAB_VERSION);
