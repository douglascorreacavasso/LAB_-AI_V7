// =============================================================================
// CORE_TYPES.JS — Lab v7 - Raciocínio
//
// Vocabulário oficial v7. ÚNICA fonte de verdade pra:
//   - TIPOS de núcleo (com hierarquia: genérico + especializações com sufixo)
//   - LAYERS (camadas 3D)
//   - ORIGIN_TYPES (de onde o núcleo veio)
//   - EDGE_KINDS (tipos de aresta/relação)
//
// PRINCÍPIO HIERÁRQUICO:
//   O nome-pai (sem sufixo) é VÁLIDO sozinho. Sufixo é especialização.
//   Ex.: 'identity' é tipo válido. 'identity_user' é especialização.
//
// PRINCÍPIO DE EXPANSÃO:
//   Quando o sistema encontra algo sem etiqueta clara, pode INVENTAR
//   uma etiqueta provisória (TYPE_PROVISIONAL) e marcá-la como _provisional.
//   A meditação consolida ou descarta depois.
// =============================================================================

'use strict';

// ============================================================
// TIPOS DE NÚCLEO (TYPE)
// ============================================================
// Cada chave do objeto é um tipo VÁLIDO sozinho.
// O array é a lista de especializações conhecidas (sufixos).
const TYPES = Object.freeze({

  // --- IDENTIDADE ---
  identity: [
    'identity_self',       // a própria Nerael
    'identity_user',       // o user (douglas)
    'identity_pessoa',     // outras pessoas (Thor, José, Jorge)
    'identity_attr',       // atributo de identidade (nome, apelido, cor_olhos)
    'identity_fact',       // fato sobre uma identidade ("douglas é mestre")
  ],

  // --- LIVRO/CONTEÚDO ABSORVIDO ---
  book: [
    'book_raw',            // texto bruto
    'book_chunk',          // pedaço quebrado
    'book_concept',        // conceito extraído
  ],

  // --- GERADO PELA IA ---
  generated: [
    'generated_msg',       // resposta da IA
    'generated_question',  // pergunta gerada
    'generated_doubt',     // "acho que entendi..."
  ],

  // --- INPUT DO USER ---
  user: [
    'user_input',          // mensagem normal
    'user_command',        // comando ("remova X", "calcula Y")
    'user_feedback_pos',   // "perfeito", "isso"
    'user_feedback_neg',   // "errado", "não"
  ],

  // --- AÇÃO (núcleos que disparam — vivem nas layers exec/parse/decisao/etc) ---
  action: [
    'action_read',         // ler dossiê/rede
    'action_write',        // escrever fato
    'action_update',       // atualizar fato existente
    'action_delete',       // remover fato/item
    'action_compute',      // calcular (1+1)
    'action_compare',      // comparar valores
    'action_infer',        // derivar por regra
    'action_ask',          // formular pergunta
    'action_wait',         // aguardar
    'action_speak',        // responder
    'action_doubt',        // marcar incerteza
    'action_parse',        // decompor mensagem
    'action_recall',       // buscar via propagação
  ],

  // --- REGRA APRENDIDA ---
  rule: [
    'rule_math',           // soma, sub etc
    'rule_linguistic',     // padrões de linguagem
    'rule_causal',         // se X então Y
  ],

  // --- PADRÃO CANDIDATO (ainda não virou rule) ---
  pattern: [
    'pattern_recurrent',   // padrão repetido
    'pattern_correlation', // X aparece junto de Y
  ],

  // --- EXEMPLOS/CONTRA-EXEMPLOS ---
  example:         [],
  counter_example: [],
  hypothesis:      [],
  contradiction:   [],

  // --- LINGUAGEM BÁSICA ---
  word:       [],
  synonym:    [],
  definition: [],

  // --- LÓGICA / CADEIAS ---
  logic_chain: [
    'logic_chain_math',
    'logic_chain_recall',
    'logic_chain_inference',
    'logic_chain_contradiction',
  ],
  logic_premise:    [],
  logic_conclusion: [],
  logic_inference:  [],

  // --- CRISTAIS / SUPER-NÚCLEOS (consolidações de meditação) ---
  cristal: [
    'cristal_entidades',
    'cristal_topicos',
    'cristal_emocoes',
    'cristal_sessao',
  ],

  // --- METADADOS DE SESSÃO ---
  conversa:        [],
  session_summary: [],

  // --- ATALHOS SEMÂNTICOS ---
  topic:   [],
  emotion: [],

  // --- ETIQUETA PROVISÓRIA (sistema inventou) ---
  // Quando ele encontra algo sem categoria, cria com este tipo
  // e seta _provisional = true. Meditação promove/descarta depois.
  provisional: [],

  // --- CONCEITO (qualquer abstração que não cabe em outro lugar) ---
  concept: [],
});

// ============================================================
// LAYERS (camadas 3D estruturais)
// ============================================================
const LAYERS = Object.freeze({
  // Camadas semânticas (do externo ao interno)
  surface:      'Input/output recente, ainda não consolidado',
  mantle:       'Memória de trabalho, em consolidação',
  core:         'Identidade estável, regras consolidadas, super-núcleos',

  // Camadas de ação (órbitas separadas — espelham o sistema real)
  exec:         'Núcleos que executam ações no mundo',
  parse:        'Núcleos que decompõem/interpretam entrada',
  decisao:      'Núcleos que decidem rota',
  orquestrador: 'Núcleos que encadeiam outros',
  write:        'Núcleos que escrevem fatos',
  wait:         'Núcleos em estado de espera (pendingClarify)',
});

const LAYER_LIST = Object.freeze(Object.keys(LAYERS));

// ============================================================
// ORIGIN_TYPES (de onde o núcleo nasceu)
// ============================================================
const ORIGINS = Object.freeze({
  CHAT:             'veio do chat com user',
  CHAT_EXAMPLE:     'exemplo dado durante chat',
  USER:             'input direto do user',
  USER_QUERY:       'pergunta explícita do user',
  BOOK:             'absorção de livro/documento',
  GENERATED:        'gerado pela IA',
  AI:               'output direto da IA',
  SYSTEM:           'criado pelo próprio sistema (boot, mecânica interna)',
  ORGANIC_LEARNING: 'aprendizado natural (Hebbian, consolidação)',
  INFERENCE:        'derivado por aplicação de regra',
  MEDITATION:       'criado em meditação',
  MERGE:            'resultado de fusão de núcleos similares (typos, duplicatas)',
  CLOSER:           'núcleo de fechamento de sessão',
  BOOT_V7:          'criado durante boot da v7 (seed)',
});

const ORIGIN_LIST = Object.freeze(Object.keys(ORIGINS));

// ============================================================
// EDGE KINDS (tipos de relação entre núcleos)
// ============================================================
const EDGE_KINDS = Object.freeze({
  // --- mecânicos (estrutura interna da rede) ---
  'co-occur':       'palavras apareceram juntas',
  'sequence':       'um veio depois do outro temporalmente',
  'hebbian':        'word↔word reforçado por uso',
  'self_link':      'liga Self-Core a atributo dela',
  'parent':         'A é pai hierárquico de B',
  'mesma_categoria':'agrupamento de categoria',
  'dialogo_pair':   'par user/ai em diálogo modelo',

  // --- semânticos (significado relacional) ---
  'refere_a':       'A se refere a B (pronome, alias)',
  'é_tipo_de':      'A é um tipo de B (instância de classe)',
  'é_classe':       'A é a classe de B (inverso)',
  'é_atributo_de':  'A é atributo de B (cor_olhos do douglas)',
  'tem':            'A tem B (posse)',
  'parte_de':       'A é parte de B (composição)',
  'sinonimo_de':    'A é sinônimo de B',
  'escrito_como':   'número 1 é escrito "um"',
  'representa':     '"um" representa 1 (inverso de escrito_como)',
  'sucessor':       'A é sucessor de B (1→2)',
  'predecessor':    'A é predecessor de B (2→1)',

  // --- lógicos ---
  'causa':          'A causa B',
  'consequencia':   'A é consequência de B',
  'exemplo_de':     'A é exemplo de B (rule)',
  'contradiz':      'A contradiz B',
  'valida':         'A valida B (feedback positivo)',
  'deriva_de':      'A foi derivado de B (inferência)',

  // --- de aprendizado ---
  'reforca':        'A reforça B',
  'inibe':          'A enfraquece B (inibição lateral)',
  'absorption_seq': 'sequência de absorção de doc',
  'absorption_word':'liga conceito a word durante absorção',
});

const EDGE_KIND_LIST = Object.freeze(Object.keys(EDGE_KINDS));

// ============================================================
// VALIDAÇÃO E HELPERS
// ============================================================

// Confere se um type é válido. Aceita tanto genérico quanto especializado.
function isValidType(t){
  if(!t) return false;
  if(TYPES[t] !== undefined) return true;             // genérico válido
  // é especialização? procura o pai
  for(const parent of Object.keys(TYPES)){
    if(TYPES[parent].includes(t)) return true;
  }
  return false;
}

// Retorna o tipo-pai (genérico) de um tipo qualquer.
// Ex: 'identity_user' → 'identity'; 'identity' → 'identity'
function parentType(t){
  if(!t) return null;
  if(TYPES[t] !== undefined) return t;
  for(const parent of Object.keys(TYPES)){
    if(TYPES[parent].includes(t)) return parent;
  }
  return null;
}

// Lista todos os tipos válidos (genéricos + especializações), flat.
function allTypes(){
  const out = [];
  for(const parent of Object.keys(TYPES)){
    out.push(parent);
    for(const child of TYPES[parent]) out.push(child);
  }
  return out;
}

// Confere se layer é válido.
function isValidLayer(l){
  return LAYER_LIST.includes(l);
}

// Confere se origin é válido. Se não for, retorna 'SYSTEM' como fallback.
function safeOrigin(o){
  return ORIGIN_LIST.includes(o) ? o : 'SYSTEM';
}

// Confere se edge kind é válido.
function isValidEdgeKind(k){
  return EDGE_KIND_LIST.includes(k);
}

// Inferência de layer por tipo (defaults sensatos)
// Quando você cria um núcleo e não passa layer, este helper decide.
function defaultLayerForType(t){
  const p = parentType(t) || t;
  if(p === 'identity'   && t === 'identity_self') return 'core';
  if(p === 'identity'   && t === 'identity_user') return 'core';
  if(p === 'identity'   && t === 'identity_attr') return 'core';
  if(p === 'identity')                            return 'mantle';

  if(p === 'rule')                                return 'core';
  if(p === 'cristal')                             return 'core';
  if(p === 'concept')                             return 'mantle';

  if(p === 'action'){
    // ações ficam em layers específicas
    if(t === 'action_compute')  return 'exec';
    if(t === 'action_parse')    return 'parse';
    if(t === 'action_read')     return 'parse';
    if(t === 'action_recall')   return 'parse';
    if(t === 'action_compare')  return 'decisao';
    if(t === 'action_infer')    return 'decisao';
    if(t === 'action_doubt')    return 'decisao';
    if(t === 'action_ask')      return 'orquestrador';
    if(t === 'action_speak')    return 'orquestrador';
    if(t === 'action_write')    return 'write';
    if(t === 'action_update')   return 'write';
    if(t === 'action_delete')   return 'write';
    if(t === 'action_wait')     return 'wait';
    return 'exec';
  }

  if(p === 'logic_chain') return 'mantle';
  if(p === 'pattern')     return 'mantle';
  if(p === 'example')     return 'mantle';
  if(p === 'hypothesis')  return 'mantle';
  if(p === 'contradiction') return 'mantle';

  if(p === 'word')        return 'surface';
  if(p === 'book')        return 'surface';
  if(p === 'generated')   return 'surface';
  if(p === 'user')        return 'surface';

  if(p === 'conversa')    return 'core';   // âncora de sessão fica perto do Self

  return 'surface';
}

// ============================================================
// EXPOR
// ============================================================
window.TYPES          = TYPES;
window.LAYERS         = LAYERS;
window.LAYER_LIST     = LAYER_LIST;
window.ORIGINS        = ORIGINS;
window.ORIGIN_LIST    = ORIGIN_LIST;
window.EDGE_KINDS     = EDGE_KINDS;
window.EDGE_KIND_LIST = EDGE_KIND_LIST;

window.isValidType        = isValidType;
window.parentType         = parentType;
window.allTypes           = allTypes;
window.isValidLayer       = isValidLayer;
window.safeOrigin         = safeOrigin;
window.isValidEdgeKind    = isValidEdgeKind;
window.defaultLayerForType = defaultLayerForType;

console.log('[core_types v7] carregado —',
  allTypes().length, 'tipos,',
  LAYER_LIST.length, 'layers,',
  ORIGIN_LIST.length, 'origins,',
  EDGE_KIND_LIST.length, 'edge kinds');
