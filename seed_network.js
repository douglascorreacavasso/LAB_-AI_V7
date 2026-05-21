// =============================================================================
// SEED_NETWORK.JS — Lab v7 - Raciocínio
//
// Seed inicial: estrutura cognitiva MÍNIMA que vem no boot.
// Tudo gravado COMO REDE DE NÚCLEOS, não como JSON de consulta.
//
// FILOSOFIA:
//   Igual criança: já vem sabendo certas coisas mecânicas (que pronome aponta
//   pra quem fala, que "mas" indica contradição, que ? marca pergunta).
//   NÃO vem sabendo: números, cores, partes do corpo, fatos sobre você.
//   Esses VOCÊ ENSINA conversando.
//
// O QUE A SEED CONTÉM (todos viram nós reais na rede):
//   1. Self-Core (única âncora identity_self)
//   2. Pronomes user (eu, meu, minha) → refere_a → conceito_quem_fala
//   3. Pronomes self (você, seu, sua) → refere_a → Self-Core
//   4. Verbos de atribuição (é, são, =) → conceito_atribuicao
//   5. Marcador de pergunta (? + palavras-pergunta) → conceito_pergunta
//   6. Marcadores de contradição (mas, errado, na verdade) → conceito_contradicao
//   7. Marcadores de feedback (sim, não, perfeito, errou) → conceito_feedback_pos/neg
//   8. Conceito_atributo (genérico) — sabe que coisas têm atributos
//   9. Templates de resposta genéricos ("ok, anotei", "entendi", "olá")
//   10. Saudações básicas (oi, olá, bom dia) → conceito_saudacao
// =============================================================================

'use strict';

// ============================================================
// APLICAR SEED — chamado no boot ou no reset
// ============================================================
function applySeed(){
  // Limpa nós antigos da seed (se houver) pra não duplicar
  const idsSeedAntiga = new Set(STATE.seed.nucleosSeed || []);
  STATE.nodes = STATE.nodes.filter(n => !idsSeedAntiga.has(n.id));
  STATE.edges = STATE.edges.filter(e => !idsSeedAntiga.has(e.a) && !idsSeedAntiga.has(e.b));
  STATE.seed.nucleosSeed = [];

  const created = [];

  // ============================================================
  // 1. SELF-CORE — núcleo único da Nerael
  // ============================================================
  const self_core = makeNode({
    id:          '__SELF_CORE__',
    type:        'identity_self',
    layer:       'core',
    origin_type: 'BOOT_V7',
    text:        'NEREL',
    mass:        10,
    is_anchor:   1,
    is_super:    1,
    pos:         [0, 0, 0],
    seed:        true,
  });
  STATE.nodes.push(self_core);
  created.push(self_core.id);

  // ============================================================
  // 2. CONCEITOS MECÂNICOS BÁSICOS (núcleos identity_attr no core)
  //    Estes representam categorias gramaticais/cognitivas.
  // ============================================================
  const conceitos = [
    // pronomes
    {id:'conc_eu',         text:'EU (quem fala)',          tipo:'pronome_user'},
    {id:'conc_voce',       text:'VOCÊ (quem ouve)',        tipo:'pronome_self'},
    {id:'conc_ele_ela',    text:'ELE/ELA (terceiro)',      tipo:'pronome_terceiro'},

    // operadores semânticos
    {id:'conc_atribuicao', text:'ATRIBUIÇÃO (é, são, =)',  tipo:'operador_logico'},
    {id:'conc_pergunta',   text:'PERGUNTA (?, qual)',      tipo:'modo_pergunta'},
    {id:'conc_contradicao',text:'CONTRADIÇÃO (mas)',       tipo:'modo_contradicao'},
    {id:'conc_posse',      text:'POSSE (tem, meu)',        tipo:'operador_logico'},

    // feedback
    {id:'conc_fb_pos',     text:'FEEDBACK POSITIVO',       tipo:'feedback'},
    {id:'conc_fb_neg',     text:'FEEDBACK NEGATIVO',       tipo:'feedback'},

    // categorias genéricas (sabe que existem, não sabe instâncias)
    {id:'conc_atributo',   text:'ATRIBUTO (categoria)',    tipo:'meta'},
    {id:'conc_nome',       text:'NOME (identificador)',    tipo:'meta'},

    // saudação/despedida
    {id:'conc_saudacao',   text:'SAUDAÇÃO',                tipo:'social'},
    {id:'conc_despedida',  text:'DESPEDIDA',               tipo:'social'},
  ];

  for(const c of conceitos){
    const n = makeNode({
      id:          c.id,
      type:        'concept',
      layer:       'core',
      origin_type: 'BOOT_V7',
      text:        c.text,
      mass:        4,
      is_anchor:   1,
      seed:        true,
    });
    STATE.nodes.push(n);
    created.push(n.id);
  }

  // ============================================================
  // 3. PALAVRAS-NÚCLEO (cada palavra mecânica vira um word-node
  //    no core, ligado ao conceito correspondente)
  // ============================================================
  const palavras = [
    // pronomes user
    {txt:'eu',      conceito:'conc_eu',         relacao:'refere_a'},
    {txt:'me',      conceito:'conc_eu',         relacao:'refere_a'},
    {txt:'meu',     conceito:'conc_eu',         relacao:'refere_a'},
    {txt:'minha',   conceito:'conc_eu',         relacao:'refere_a'},
    {txt:'meus',    conceito:'conc_eu',         relacao:'refere_a'},
    {txt:'minhas',  conceito:'conc_eu',         relacao:'refere_a'},
    {txt:'mim',     conceito:'conc_eu',         relacao:'refere_a'},
    {txt:'comigo',  conceito:'conc_eu',         relacao:'refere_a'},

    // pronomes self
    {txt:'voce',    conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'você',    conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'vc',      conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'seu',     conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'sua',     conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'seus',    conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'suas',    conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'te',      conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'teu',     conceito:'conc_voce',       relacao:'refere_a'},
    {txt:'tua',     conceito:'conc_voce',       relacao:'refere_a'},

    // atribuição
    {txt:'é',       conceito:'conc_atribuicao', relacao:'refere_a'},
    {txt:'são',     conceito:'conc_atribuicao', relacao:'refere_a'},
    {txt:'sao',     conceito:'conc_atribuicao', relacao:'refere_a'},
    {txt:'=',       conceito:'conc_atribuicao', relacao:'refere_a'},
    {txt:'vale',    conceito:'conc_atribuicao', relacao:'refere_a'},

    // pergunta
    {txt:'?',       conceito:'conc_pergunta',   relacao:'refere_a'},
    {txt:'qual',    conceito:'conc_pergunta',   relacao:'refere_a'},
    {txt:'quanto',  conceito:'conc_pergunta',   relacao:'refere_a'},
    {txt:'como',    conceito:'conc_pergunta',   relacao:'refere_a'},
    {txt:'quando',  conceito:'conc_pergunta',   relacao:'refere_a'},
    {txt:'onde',    conceito:'conc_pergunta',   relacao:'refere_a'},
    {txt:'quem',    conceito:'conc_pergunta',   relacao:'refere_a'},
    {txt:'oque',    conceito:'conc_pergunta',   relacao:'refere_a'},

    // contradição
    {txt:'mas',         conceito:'conc_contradicao', relacao:'refere_a'},
    {txt:'porem',       conceito:'conc_contradicao', relacao:'refere_a'},
    {txt:'porém',       conceito:'conc_contradicao', relacao:'refere_a'},
    {txt:'na verdade',  conceito:'conc_contradicao', relacao:'refere_a'},
    {txt:'nao é',       conceito:'conc_contradicao', relacao:'refere_a'},
    {txt:'não é',       conceito:'conc_contradicao', relacao:'refere_a'},

    // posse
    {txt:'tem',     conceito:'conc_posse',      relacao:'refere_a'},
    {txt:'tenho',   conceito:'conc_posse',      relacao:'refere_a'},
    {txt:'tens',    conceito:'conc_posse',      relacao:'refere_a'},

    // feedback positivo
    {txt:'sim',     conceito:'conc_fb_pos',     relacao:'refere_a'},
    {txt:'perfeito',conceito:'conc_fb_pos',     relacao:'refere_a'},
    {txt:'isso',    conceito:'conc_fb_pos',     relacao:'refere_a'},
    {txt:'certo',   conceito:'conc_fb_pos',     relacao:'refere_a'},
    {txt:'correto', conceito:'conc_fb_pos',     relacao:'refere_a'},

    // feedback negativo
    {txt:'nao',     conceito:'conc_fb_neg',     relacao:'refere_a'},
    {txt:'não',     conceito:'conc_fb_neg',     relacao:'refere_a'},
    {txt:'errado',  conceito:'conc_fb_neg',     relacao:'refere_a'},
    {txt:'errou',   conceito:'conc_fb_neg',     relacao:'refere_a'},
    {txt:'jamais',  conceito:'conc_fb_neg',     relacao:'refere_a'},

    // saudação
    {txt:'oi',         conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'olá',        conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'ola',        conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'opa',        conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'eai',        conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'eaí',        conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'bom dia',    conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'boa tarde',  conceito:'conc_saudacao', relacao:'refere_a'},
    {txt:'boa noite',  conceito:'conc_saudacao', relacao:'refere_a'},

    // despedida
    {txt:'tchau',      conceito:'conc_despedida', relacao:'refere_a'},
    {txt:'ate',        conceito:'conc_despedida', relacao:'refere_a'},
    {txt:'até',        conceito:'conc_despedida', relacao:'refere_a'},
    {txt:'falou',      conceito:'conc_despedida', relacao:'refere_a'},

    // PALAVRAS ESTRUTURAIS QUE LIGAM A META-CONCEITOS
    // (sem essas, o user fala "nome" e o sistema acha que é desconhecido)
    {txt:'nome',       conceito:'conc_nome',       relacao:'é_tipo_de'},
    {txt:'apelido',    conceito:'conc_nome',       relacao:'é_tipo_de'},
    {txt:'atributo',   conceito:'conc_atributo',   relacao:'é_tipo_de'},
    {txt:'qualidade',  conceito:'conc_atributo',   relacao:'é_tipo_de'},
    {txt:'caracteristica', conceito:'conc_atributo', relacao:'é_tipo_de'},
    {txt:'característica', conceito:'conc_atributo', relacao:'é_tipo_de'},
  ];

  for(const p of palavras){
    const id = 'word_' + norm(p.txt).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if(STATE.nodes.find(n => n.id === id)) continue;  // dedupe
    const wn = makeNode({
      id:          id,
      type:        'word',
      layer:       'core',
      origin_type: 'BOOT_V7',
      text:        p.txt,
      mass:        2,
      seed:        true,
    });
    STATE.nodes.push(wn);
    created.push(wn.id);

    // Aresta forte word → conceito
    const e = makeEdge({
      a: wn.id, b: p.conceito, w: 0.9, kind: p.relacao, seed: true
    });
    STATE.edges.push(e);
  }

  // ============================================================
  // 4. LIGAÇÃO ESPECIAL: pronomes self apontam pro Self-Core
  // ============================================================
  // "você", "seu", "te" etc → também ligam diretamente ao Self-Core
  const wordsSelf = ['word_voce', 'word_voce_acent', 'word_vc', 'word_seu',
                     'word_sua', 'word_seus', 'word_suas', 'word_te', 'word_teu', 'word_tua'];
  for(const wid of wordsSelf){
    const exists = STATE.nodes.find(n => n.id === wid);
    if(!exists) continue;
    const e = makeEdge({
      a: wid, b: '__SELF_CORE__', w: 0.95, kind: 'refere_a', seed: true
    });
    STATE.edges.push(e);
  }
  // O Self-Core também referencia o conceito de "voce" (loop)
  STATE.edges.push(makeEdge({
    a: '__SELF_CORE__', b: 'conc_voce', w: 0.9, kind: 'é_atributo_de', seed: true
  }));

  // ============================================================
  // 5. TEMPLATES DE RESPOSTA (frases genéricas que ele pode usar)
  //    Vivem como núcleos generated_msg na surface, ligados a conceitos
  // ============================================================
  const templates = [
    // resposta a saudação
    {text:'oi! tudo bem?',          ligado_a:'conc_saudacao', tag:'saudacao_resposta'},
    {text:'olá! como vai?',         ligado_a:'conc_saudacao', tag:'saudacao_resposta'},
    {text:'opa! beleza?',           ligado_a:'conc_saudacao', tag:'saudacao_resposta'},
    {text:'eaí! tudo certo?',       ligado_a:'conc_saudacao', tag:'saudacao_resposta'},

    // resposta a despedida
    {text:'tchau!',                 ligado_a:'conc_despedida', tag:'despedida_resposta'},
    {text:'até mais!',              ligado_a:'conc_despedida', tag:'despedida_resposta'},

    // resposta a feedback positivo
    {text:'que bom!',               ligado_a:'conc_fb_pos', tag:'fb_resposta'},
    {text:'show!',                  ligado_a:'conc_fb_pos', tag:'fb_resposta'},
    {text:'massa!',                 ligado_a:'conc_fb_pos', tag:'fb_resposta'},

    // resposta a feedback negativo
    {text:'desculpa, vou corrigir.',ligado_a:'conc_fb_neg', tag:'fb_resposta'},
    {text:'tá, errei. anulado.',    ligado_a:'conc_fb_neg', tag:'fb_resposta'},

    // resposta a atribuição (alguém disse "X é Y")
    {text:'ok, anotei.',            ligado_a:'conc_atribuicao', tag:'atrib_resposta'},
    {text:'entendi.',               ligado_a:'conc_atribuicao', tag:'atrib_resposta'},
    {text:'beleza, vou guardar.',   ligado_a:'conc_atribuicao', tag:'atrib_resposta'},

    // resposta a pergunta sem saber
    {text:'hmm, não sei ainda. me ensina?',
                                    ligado_a:'conc_pergunta', tag:'pergunta_sem_resposta'},
    {text:'ainda não aprendi isso. pode me explicar?',
                                    ligado_a:'conc_pergunta', tag:'pergunta_sem_resposta'},

    // resposta a contradição
    {text:'mas você não disse {valor_anterior} antes?',
                                    ligado_a:'conc_contradicao', tag:'contradicao_pergunta'},
    {text:'antes era {valor_anterior}, mudou pra {valor_novo}?',
                                    ligado_a:'conc_contradicao', tag:'contradicao_pergunta'},
  ];

  for(let i = 0; i < templates.length; i++){
    const t = templates[i];
    const id = 'tpl_' + i + '_' + (t.tag || 'generic');
    const tn = makeNode({
      id:          id,
      type:        'generated_msg',
      layer:       'mantle',
      origin_type: 'BOOT_V7',
      text:        t.text,
      mass:        1.5,
      seed:        true,
    });
    tn._template_tag = t.tag;
    STATE.nodes.push(tn);
    created.push(tn.id);

    // Liga template ao conceito que dispara ele
    STATE.edges.push(makeEdge({
      a: tn.id, b: t.ligado_a, w: 0.7, kind: 'exemplo_de', seed: true
    }));
  }

  // ============================================================
  // 6. LIGAÇÕES CONCEITUAIS CRUZADAS (rede semântica básica)
  // ============================================================
  // conc_eu se relaciona com conc_posse (eu tenho)
  STATE.edges.push(makeEdge({
    a:'conc_eu', b:'conc_posse', w:0.5, kind:'co-occur', seed:true
  }));
  // conc_voce se relaciona com conc_posse (você tem)
  STATE.edges.push(makeEdge({
    a:'conc_voce', b:'conc_posse', w:0.5, kind:'co-occur', seed:true
  }));
  // conc_atribuicao se relaciona com conc_nome (X é nome)
  STATE.edges.push(makeEdge({
    a:'conc_atribuicao', b:'conc_nome', w:0.5, kind:'co-occur', seed:true
  }));
  // conc_atribuicao com conc_atributo
  STATE.edges.push(makeEdge({
    a:'conc_atribuicao', b:'conc_atributo', w:0.5, kind:'co-occur', seed:true
  }));
  // conc_contradicao se relaciona com conc_pergunta (contradição GERA pergunta)
  STATE.edges.push(makeEdge({
    a:'conc_contradicao', b:'conc_pergunta', w:0.7, kind:'causa', seed:true
  }));
  // conc_pergunta se relaciona com conc_atribuicao (pergunta de "X é o quê?")
  STATE.edges.push(makeEdge({
    a:'conc_pergunta', b:'conc_atribuicao', w:0.4, kind:'co-occur', seed:true
  }));

  // ============================================================
  // FECHAMENTO — registra na seed
  // ============================================================
  STATE.seed.loaded = true;
  STATE.seed.loadedAt = new Date().toISOString();
  STATE.seed.nucleosSeed = created;

  console.log(`[seed v${LAB_VERSION}] aplicada:`,
    created.length, 'núcleos,',
    STATE.edges.filter(e => e._seed).length, 'arestas');

  return created.length;
}

// ============================================================
// STATS DA SEED
// ============================================================
function seedStats(){
  if(!STATE.seed.loaded) return null;
  const ids = new Set(STATE.seed.nucleosSeed);
  const nodes = STATE.nodes.filter(n => ids.has(n.id));
  const edges = STATE.edges.filter(e => e._seed);
  return {
    loaded:     true,
    loadedAt:   STATE.seed.loadedAt,
    total:      nodes.length,
    palavras:   nodes.filter(n => n.type === 'word').length,
    conceitos:  nodes.filter(n => n.type === 'concept').length,
    templates:  nodes.filter(n => n.type === 'generated_msg').length,
    arestas:    edges.length,
    self_core:  !!STATE.nodes.find(n => n.id === '__SELF_CORE__'),
  };
}

// ============================================================
// EXPOR
// ============================================================
window.applySeed = applySeed;
window.seedStats = seedStats;

console.log('[seed_network v7] carregado');
