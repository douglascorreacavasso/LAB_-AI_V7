// =============================================================================
// UI_NETWORK.JS — Lab v7 - Raciocínio
//
// Render do canvas 2D da "rede viva".
//
// IMPORTANTE:
//   - Os dados são 3D (node.pos = [x,y,z])
//   - O canvas é 2D — projetamos x,y direto, ignorando z PRA POSIÇÃO
//     mas usando z pra ajustar TAMANHO/OPACIDADE (sensação de profundidade)
//   - Física de gravidade roda em 3D (core_physics.tickGravidade)
//   - Núcleos próximos do Self ficam no centro do canvas
//
// CORES POR TIPO:
//   identity_self      → verde forte com aro
//   identity_user      → azul (usuário, sujeitos)
//   identity_attr/fact → amarelo (fatos consolidados)
//   word               → roxo (palavras)
//   concept            → ciano (conceitos seed)
//   generated_msg      → verde claro (respostas/templates)
//   action_*           → laranja (núcleos de ação)
//   rule/pattern       → amarelo brilhante
//   provisional        → cinza pontilhado
//   default            → branco
// =============================================================================

'use strict';

let _canvas = null, _ctx = null;
let _W = 0, _H = 0;
let _running = false;
let _frameCount = 0;

// ============================================================
// INIT
// ============================================================
function initNetworkUI(){
  _canvas = $('graph');
  if(!_canvas){
    console.error('[ui_network] canvas #graph não encontrado');
    return;
  }
  _ctx = _canvas.getContext('2d');
  _resize();
  window.addEventListener('resize', _resize);

  console.log('[ui_network v7] canvas inicializado:', _W, 'x', _H);

  // Inicia loop de física + render
  _startLoop();
}

function _resize(){
  if(!_canvas) return;
  const parent = _canvas.parentElement;
  const r = parent.getBoundingClientRect();
  // tira 32 (col-head) + 44 (stats)
  _canvas.width  = r.width;
  _canvas.height = r.height - 76;
  _W = _canvas.width;
  _H = _canvas.height;
}

// ============================================================
// LOOP DE FÍSICA + RENDER
// ============================================================
function _startLoop(){
  if(_running) return;
  _running = true;

  function frame(){
    if(!_running) return;
    // Física a cada 2 frames (60fps → 30fps gravity)
    _frameCount++;
    if(_frameCount % 2 === 0 && typeof tickGravidade === 'function'){
      tickGravidade();
    }
    _render();
    requestAnimationFrame(frame);
  }
  frame();
}

function stopNetworkLoop(){
  _running = false;
}

// ============================================================
// PROJEÇÃO 3D → 2D
// Pega node.pos = [x,y,z] e mapeia pro canvas.
// Centro do canvas = origem (Self fica no centro).
// Escala uniforme baseada no maior raio (LAYER_RADIUS.surface)
// ============================================================
function _project(pos){
  const scale = Math.min(_W, _H) * 0.4 / PHYSICS.LAYER_RADIUS.surface;
  return {
    sx: _W/2 + pos[0] * scale,
    sy: _H/2 + pos[1] * scale,
    sz: pos[2] * scale,    // pra ajustar tamanho/opacidade
  };
}

// ============================================================
// COR POR TIPO/LAYER
// ============================================================
function _colorFor(node){
  const t = node.type;
  if(t === 'identity_self') return '#22c55e';
  if(t === 'identity_user') return '#7dd3fc';
  if(t === 'identity_attr' || t === 'identity_fact') return '#fbbf24';
  if(t === 'word') return '#c4b5fd';
  if(t === 'concept') return '#5eead4';
  if(t === 'generated_msg' || t === 'generated') return '#86efac';
  if(t && t.startsWith('action_')) return '#fb923c';
  if(t === 'rule' || (t || '').startsWith('rule_')) return '#fde047';
  if(t === 'pattern' || (t || '').startsWith('pattern_')) return '#fcd34d';
  if(t === 'user_input' || t === 'user_command') return '#7dd3fc';
  if(node._base || node._seed) return '#f472b6';
  return '#ffffff';
}

// ============================================================
// COR DA ARESTA POR KIND
// ============================================================
function _edgeColor(e){
  if(e._lit) return 'rgba(253, 224, 71, 0.85)';            // amarelo brilhante = iluminado agora
  if(e.kind === 'self_link') return 'rgba(134, 239, 172, 0.5)';
  if(e.kind === 'hebbian')   return 'rgba(196, 181, 253, 0.55)';
  if(e.kind === 'refere_a')  return 'rgba(94, 234, 212, 0.4)';
  if(e.kind === 'sequence')  return 'rgba(125, 211, 252, 0.3)';
  if(e._seed)                return 'rgba(244, 114, 182, 0.25)';
  return 'rgba(94, 234, 212, 0.25)';
}

// ============================================================
// RENDER
// ============================================================
function _render(){
  if(!_ctx) return;
  _ctx.clearRect(0, 0, _W, _H);

  // background sutil
  const g = _ctx.createRadialGradient(_W/2, _H/2, 5, _W/2, _H/2, Math.max(_W, _H));
  g.addColorStop(0, 'rgba(94,234,212,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  _ctx.fillStyle = g;
  _ctx.fillRect(0, 0, _W, _H);

  // 1. arestas primeiro (atrás dos nós)
  for(const e of STATE.edges){
    const a = STATE.nodes.find(n => n.id === e.a);
    const b = STATE.nodes.find(n => n.id === e.b);
    if(!a || !b || !a.pos || !b.pos) continue;

    const pa = _project(a.pos);
    const pb = _project(b.pos);

    const op = Math.min(0.7, 0.15 + (e.w || 0.2) * 0.6);
    const baseColor = _edgeColor(e);
    _ctx.strokeStyle = baseColor;
    _ctx.lineWidth = e._lit ? 2 : (0.5 + (e.w || 0) * 1.2);
    _ctx.beginPath();
    _ctx.moveTo(pa.sx, pa.sy);
    _ctx.lineTo(pb.sx, pb.sy);
    _ctx.stroke();
  }

  // 2. nós
  for(const n of STATE.nodes){
    if(!n.pos) continue;
    const p = _project(n.pos);

    // Z afeta tamanho e opacidade (profundidade)
    const zFactor = 1 - Math.min(0.5, Math.abs(p.sz) / 100);
    const baseR = 3 + Math.min(11, Math.sqrt(n.mass || 1) * 1.6);
    const r = baseR * zFactor;

    const lit = (n.energy || 0) > PHYSICS.THRESHOLD_LIT;
    const cor = _colorFor(n);

    // halo se iluminado
    if(lit){
      const halo = _ctx.createRadialGradient(p.sx, p.sy, r, p.sx, p.sy, r * 3);
      halo.addColorStop(0, 'rgba(253,224,71,0.5)');
      halo.addColorStop(1, 'rgba(253,224,71,0)');
      _ctx.fillStyle = halo;
      _ctx.beginPath();
      _ctx.arc(p.sx, p.sy, r * 3, 0, Math.PI*2);
      _ctx.fill();
    }

    // self-core especial
    if(n.type === 'identity_self'){
      // halo verde permanente
      const sh = _ctx.createRadialGradient(p.sx, p.sy, r*0.5, p.sx, p.sy, r*3);
      sh.addColorStop(0, 'rgba(134,239,172,0.4)');
      sh.addColorStop(1, 'rgba(134,239,172,0)');
      _ctx.fillStyle = sh;
      _ctx.beginPath();
      _ctx.arc(p.sx, p.sy, r*3, 0, Math.PI*2);
      _ctx.fill();
      // aro
      _ctx.strokeStyle = '#86efac';
      _ctx.lineWidth = 2;
      _ctx.beginPath();
      _ctx.arc(p.sx, p.sy, r*1.6, 0, Math.PI*2);
      _ctx.stroke();
      // corpo
      _ctx.fillStyle = cor;
      _ctx.beginPath();
      _ctx.arc(p.sx, p.sy, r*1.3, 0, Math.PI*2);
      _ctx.fill();
      // texto
      _ctx.fillStyle = '#0a0d10';
      _ctx.font = 'bold 9px monospace';
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText('SELF', p.sx, p.sy);
      continue;
    }

    // super-núcleo: borda dourada
    if(n.is_super){
      _ctx.strokeStyle = '#fde047';
      _ctx.lineWidth = 1.5;
      _ctx.beginPath();
      _ctx.arc(p.sx, p.sy, r * 1.4, 0, Math.PI*2);
      _ctx.stroke();
    }

    // provisional: pontilhado cinza
    if(n._provisional){
      _ctx.strokeStyle = '#6b7882';
      _ctx.lineWidth = 1;
      _ctx.setLineDash([2, 2]);
      _ctx.beginPath();
      _ctx.arc(p.sx, p.sy, r * 1.2, 0, Math.PI*2);
      _ctx.stroke();
      _ctx.setLineDash([]);
    }

    // corpo
    _ctx.fillStyle = lit ? '#fde047' : cor;
    _ctx.globalAlpha = 0.5 + zFactor * 0.5;
    _ctx.beginPath();
    _ctx.arc(p.sx, p.sy, r, 0, Math.PI*2);
    _ctx.fill();
    _ctx.globalAlpha = 1;
  }
}

function renderNetwork(){
  // wrapper público pra forçar redraw imediato
  _render();
}

// ============================================================
// EXPOR
// ============================================================
window.initNetworkUI = initNetworkUI;
window.renderNetwork = renderNetwork;
window.stopNetworkLoop = stopNetworkLoop;

console.log('[ui_network v7] carregado');
