// =============================================================================
// SEED_OPERADORES.JS — Lab v7 - Raciocínio
//
// OPERADORES MATEMÁTICOS BÁSICOS NA SEED.
//
// FILOSOFIA:
//   Pra o sistema aprender que "n+n=2n", ele precisa primeiro RECONHECER
//   estruturalmente uma frase tipo "2 + 2 = 4" como:
//     [número] [operador_soma] [número] [operador_igual] [número]
//
//   Esses conceitos base vêm na seed. O ENTENDIMENTO de que "+" dá 2n
//   quando os operandos são iguais NÃO vem — vem por inferência (learn_pattern).
//
// O QUE CRIA:
//   1. conc_numero (categoria genérica)
//   2. conc_operador_soma, conc_operador_subt, conc_operador_mult, conc_operador_div
//   3. conc_operador_igual (resultado)
//   4. Números 0-10 como word-nodes com _valor_numerico
//   5. Símbolos +, -, *, /, = como word-nodes ligados aos operadores
//   6. Palavras "mais", "menos", "vezes", "dividido" ligadas aos operadores
//   7. Palavras "quanto", "resultado", "igual" → modo cálculo
// =============================================================================

'use strict';

function applySeedOperadores(){
  const ids = STATE.seed.nucleosSeed || [];
  let criados = 0;

  // ============================================================
  // 1. CONCEITOS-OPERADOR (categorias)
  // ============================================================
  const conceitosMath = [
    {id:'conc_numero',         text:'NÚMERO (categoria)',     tipo:'math_categoria'},
    {id:'conc_op_soma',        text:'OPERADOR SOMA (+)',      tipo:'math_operador'},
    {id:'conc_op_subt',        text:'OPERADOR SUBT (-)',      tipo:'math_operador'},
    {id:'conc_op_mult',        text:'OPERADOR MULT (×)',      tipo:'math_operador'},
    {id:'conc_op_div',         text:'OPERADOR DIV (÷)',       tipo:'math_operador'},
    {id:'conc_op_igual',       text:'OPERADOR IGUAL (=)',     tipo:'math_operador'},
    {id:'conc_calculo',        text:'CÁLCULO (pergunta)',     tipo:'math_modo'},
  ];

  for(const c of conceitosMath){
    if(STATE.nodes.find(n => n.id === c.id)) continue;
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
    n._tipo_meta = c.tipo;
    STATE.nodes.push(n);
    ids.push(n.id);
    criados++;
  }

  // ============================================================
  // 2. NÚMEROS 0-10 COMO WORD-NODES (com _valor_numerico)
  // ============================================================
  const numeros = [
    {txt:'0',  val:0, nome:'zero'},
    {txt:'1',  val:1, nome:'um'},
    {txt:'2',  val:2, nome:'dois'},
    {txt:'3',  val:3, nome:'tres'},
    {txt:'4',  val:4, nome:'quatro'},
    {txt:'5',  val:5, nome:'cinco'},
    {txt:'6',  val:6, nome:'seis'},
    {txt:'7',  val:7, nome:'sete'},
    {txt:'8',  val:8, nome:'oito'},
    {txt:'9',  val:9, nome:'nove'},
    {txt:'10', val:10, nome:'dez'},
  ];

  for(const num of numeros){
    // Versão dígito
    const idDig = 'num_' + num.val;
    if(!STATE.nodes.find(n => n.id === idDig)){
      const ndig = makeNode({
        id:          idDig,
        type:        'word',
        layer:       'core',
        origin_type: 'BOOT_V7',
        text:        num.txt,
        mass:        2,
        seed:        true,
      });
      ndig._valor_numerico = num.val;
      ndig._eh_numero = true;
      STATE.nodes.push(ndig);
      ids.push(idDig);
      // Liga ao conceito_numero
      STATE.edges.push(makeEdge({
        a: idDig, b: 'conc_numero', w: 0.95, kind: 'é_tipo_de', seed: true
      }));
      criados++;
    }

    // Versão por extenso (zero, um, dois, ...) — ligando AO MESMO conceito
    const idExt = 'word_' + num.nome;
    if(!STATE.nodes.find(n => n.id === idExt)){
      const next = makeNode({
        id:          idExt,
        type:        'word',
        layer:       'core',
        origin_type: 'BOOT_V7',
        text:        num.nome,
        mass:        2,
        seed:        true,
      });
      next._valor_numerico = num.val;
      next._eh_numero = true;
      STATE.nodes.push(next);
      ids.push(idExt);
      STATE.edges.push(makeEdge({
        a: idExt, b: 'conc_numero', w: 0.95, kind: 'é_tipo_de', seed: true
      }));
      // Sinônimo: 'dois' representa o mesmo valor que '2'
      STATE.edges.push(makeEdge({
        a: idExt, b: idDig, w: 0.9, kind: 'sinonimo_de', seed: true
      }));
      criados++;
    }
  }

  // ============================================================
  // 3. SÍMBOLOS DE OPERADOR (+, -, *, ×, /, ÷, =)
  // ============================================================
  const operadores = [
    {txt:'+',         conceito:'conc_op_soma'},
    {txt:'mais',      conceito:'conc_op_soma'},
    {txt:'soma',      conceito:'conc_op_soma'},
    {txt:'somado',    conceito:'conc_op_soma'},
    {txt:'-',         conceito:'conc_op_subt'},
    {txt:'menos',     conceito:'conc_op_subt'},
    {txt:'subtraido', conceito:'conc_op_subt'},
    {txt:'subtraído', conceito:'conc_op_subt'},
    {txt:'*',         conceito:'conc_op_mult'},
    {txt:'x',         conceito:'conc_op_mult'},
    {txt:'×',         conceito:'conc_op_mult'},
    {txt:'vezes',     conceito:'conc_op_mult'},
    {txt:'multiplicado', conceito:'conc_op_mult'},
    {txt:'/',         conceito:'conc_op_div'},
    {txt:'÷',         conceito:'conc_op_div'},
    {txt:'dividido',  conceito:'conc_op_div'},
    {txt:'=',         conceito:'conc_op_igual'},
    {txt:'igual',     conceito:'conc_op_igual'},
    {txt:'da',        conceito:'conc_op_igual'},    // "2 mais 2 da 4"
    {txt:'dá',        conceito:'conc_op_igual'},
    {txt:'resulta',   conceito:'conc_op_igual'},
  ];

  for(const op of operadores){
    // ID por símbolo + texto, garantindo unicidade
    const symMap = {
      '+':'plus','-':'minus','*':'star','x':'x','×':'times','/':'slash','÷':'div','=':'eq',
    };
    const sym = symMap[op.txt];
    const idSafe = sym ? ('op_' + sym) : ('op_' + op.txt.toLowerCase().replace(/[^a-z0-9]/g, '_'));

    if(STATE.nodes.find(n => n.id === idSafe)) continue;
    const n = makeNode({
      id:          idSafe,
      type:        'word',
      layer:       'core',
      origin_type: 'BOOT_V7',
      text:        op.txt,
      mass:        2.5,
      seed:        true,
    });
    n._eh_operador = true;
    n._conceito_op = op.conceito;
    STATE.nodes.push(n);
    ids.push(idSafe);
    STATE.edges.push(makeEdge({
      a: idSafe, b: op.conceito, w: 0.95, kind: 'refere_a', seed: true
    }));
    criados++;
  }

  // ============================================================
  // 4. PALAVRAS DE PERGUNTA-CÁLCULO
  // ============================================================
  const palavrasCalc = [
    'quanto', 'resultado', 'conta',
  ];
  for(const p of palavrasCalc){
    const id = 'word_calc_' + p.replace(/[^a-z]/g, '');
    if(STATE.nodes.find(n => n.id === id)) continue;
    const n = makeNode({
      id:          id,
      type:        'word',
      layer:       'core',
      origin_type: 'BOOT_V7',
      text:        p,
      mass:        1.5,
      seed:        true,
    });
    STATE.nodes.push(n);
    ids.push(id);
    STATE.edges.push(makeEdge({
      a: id, b: 'conc_calculo', w: 0.9, kind: 'refere_a', seed: true
    }));
    STATE.edges.push(makeEdge({
      a: id, b: 'conc_pergunta', w: 0.6, kind: 'refere_a', seed: true
    }));
    criados++;
  }

  // ============================================================
  // 5. LIGAÇÕES CONCEITUAIS
  // operadores se relacionam com conceito_numero (operam sobre números)
  // ============================================================
  const opsConc = ['conc_op_soma','conc_op_subt','conc_op_mult','conc_op_div','conc_op_igual'];
  for(const opId of opsConc){
    STATE.edges.push(makeEdge({
      a: opId, b: 'conc_numero', w: 0.6, kind: 'co-occur', seed: true
    }));
  }
  // conc_calculo se relaciona com conc_pergunta (pedir cálculo é pergunta)
  STATE.edges.push(makeEdge({
    a: 'conc_calculo', b: 'conc_pergunta', w: 0.7, kind: 'é_tipo_de', seed: true
  }));

  STATE.seed.nucleosSeed = ids;
  console.log(`[seed_operadores v${LAB_VERSION}] adicionados ${criados} núcleos matemáticos`);
  return criados;
}

// ============================================================
// HELPER: dado um word-id, retorna valor numérico se aplicável
// ============================================================
function getNumericValue(wordId){
  const n = STATE.nodes.find(x => x.id === wordId);
  if(!n) return null;
  if(typeof n._valor_numerico === 'number') return n._valor_numerico;
  // Tenta parsear o text se for dígito puro
  const t = (n.text || '').trim();
  if(/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  return null;
}

// ============================================================
// HELPER: dado um word-id, retorna se é operador e qual conceito
// ============================================================
function getOperator(wordId){
  const n = STATE.nodes.find(x => x.id === wordId);
  if(!n || !n._eh_operador) return null;
  return n._conceito_op;
}

// ============================================================
// EXPOR
// ============================================================
window.applySeedOperadores = applySeedOperadores;
window.getNumericValue     = getNumericValue;
window.getOperator         = getOperator;

console.log('[seed_operadores v7] carregado');
