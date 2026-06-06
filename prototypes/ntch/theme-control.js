/**
 * theme-control.js  — Universal Dashboard Theme Control Panel v3
 * Drop <script src="theme-control.js"></script> at the end of <body>.
 * Persists to localStorage; syncs across tabs via BroadcastChannel.
 */
(function () {
  'use strict';
  if (document.getElementById('tc-root')) return;

  // ─── Gate logic ────────────────────────────────────────────────────────────
  function getMode() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'dev') return 'dev';
    if (mode === 'pro' || localStorage.getItem('tb_license')) return 'pro';
    return 'demo';
  }

  function isFeatureUnlocked(feature) {
    const mode = getMode();
    if (mode === 'dev') return true;
    if (mode === 'pro') return true;
    // Demo: specific features locked
    const proOnly = ['export_css', 'export_tailwind', 'export_figma', 'import_theme', 'save_preset', 'vibe_organic', 'vibe_energy', 'vibe_bg_hue'];
    return !proOnly.includes(feature);
  }

  const LS_STATE   = 'tc_state_v1';
  const LS_PRESETS = 'tc_presets_v1';
  const LS_HIST    = 'tc_hist_v1';
  const BC_NAME    = 'tc_broadcast';
  const MAX_HIST   = 50;
  const SVG_CX = 130, SVG_CY = 130, SVG_R = 95;

  const AXES = [
    { id:'light',    label:'Light',    neg:'Dark',    deg:-90  },
    { id:'warm',     label:'Warm',     neg:'Cool',    deg:-30  },
    { id:'vivid',    label:'Vivid',    neg:'Mono',    deg: 30  },
    { id:'airy',     label:'Airy',     neg:'Dense',   deg: 90  },
    { id:'contrast', label:'Contrast', neg:'Soft',    deg: 150 },
    { id:'rich',     label:'Rich',     neg:'Minimal', deg: 210 },
  ];

  // Font family presets
  const FONT_PRESETS = [
    { label:'System',    family:`-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif` },
    { label:'Serif',     family:`Georgia,'Times New Roman',serif` },
    { label:'Mono',      family:`'SF Mono','Fira Code','Consolas',monospace` },
    { label:'Geometric', family:`'Futura','Century Gothic','Trebuchet MS',sans-serif` },
    { label:'Humanist',  family:`'Optima','Gill Sans','Segoe UI',sans-serif` },
    { label:'Custom',    family:null },
  ];

  // Slider groups
  const SLIDERS_TYPE = [
    { id:'scale',    label:'Scale',      lo:'Small',   hi:'Large',   min:70, max:130, def:100 },
    { id:'weight',   label:'Weight',     lo:'Thin',    hi:'Heavy',   min:0,  max:100, def:40  },
    { id:'leading',  label:'Line ht',    lo:'Compact', hi:'Airy',    min:0,  max:100, def:50  },
    { id:'tracking', label:'Spacing',    lo:'Tight',   hi:'Loose',   min:0,  max:100, def:50  },
    { id:'hRatio',   label:'H1 ratio',   lo:'1.2×',    hi:'3×',      min:0,  max:100, def:55  },
    { id:'h2Ratio',  label:'H2 ratio',   lo:'1.0×',    hi:'2×',      min:0,  max:100, def:50  },
    { id:'txOpacity',label:'Tx opacity', lo:'Dim',     hi:'Full',    min:0,  max:100, def:85  },
    { id:'muOpacity',label:'Mu opacity', lo:'Ghost',   hi:'Clear',   min:0,  max:100, def:50  },
  ];
  const SLIDERS_COLOR = [
    { id:'hue',      label:'Hue',        lo:'0°',      hi:'360°',    min:0,  max:359, def:217 },
    { id:'accSat',   label:'Acc sat',    lo:'Muted',   hi:'Vivid',   min:0,  max:100, def:70  },
    { id:'colors',   label:'Accents',    lo:'1',       hi:'6',       min:1,  max:6,   def:2   },
    { id:'tint',     label:'Surf tint',  lo:'Neutral', hi:'Tinted',  min:0,  max:100, def:30  },
    { id:'accHueSplit', label:'Split',   lo:'Mono',    hi:'Split',   min:0,  max:180, def:0   },
  ];
  const SLIDERS_LAYOUT = [
    { id:'radius',       label:'Corners',      lo:'Sharp',   hi:'Round',   min:0,  max:100, def:60  },
    { id:'border',       label:'Borders',      lo:'None',    hi:'Bold',    min:0,  max:100, def:40  },
    { id:'shadow',       label:'Depth',        lo:'Flat',    hi:'Deep',    min:0,  max:100, def:50  },
    { id:'motion',       label:'Motion',       lo:'Still',   hi:'Lively',  min:0,  max:100, def:30  },
    { id:'density',      label:'Density',      lo:'Compact', hi:'Spacious',min:0,  max:100, def:50  },
    { id:'iconScale',    label:'Icon scale',   lo:'Small',   hi:'Large',   min:0,  max:100, def:50  },
    { id:'surfaceAlpha', label:'Surf opacity', lo:'Glass',   hi:'Solid',   min:0,  max:100, def:100 },
    { id:'glassBlur',    label:'Glass blur',   lo:'None',    hi:'Heavy',   min:0,  max:100, def:0   },
  ];
  const SLIDERS_VIBE = [
    { id:'organic',  label:'Organic',    lo:'Tech',    hi:'Nature',  min:0,  max:100, def:20  },
    { id:'polish',   label:'Polish',     lo:'Raw',     hi:'Refined', min:0,  max:100, def:65  },
    { id:'energy',   label:'Energy',     lo:'Calm',    hi:'Electric',min:0,  max:100, def:40  },
    { id:'bgHue',    label:'BG hue',     lo:'−60°',    hi:'+60°',    min:-60,max:60,  def:0   },
    { id:'sfSep',    label:'SF depth',   lo:'Flat',    hi:'Layered', min:0,  max:100, def:50  },
    { id:'sfSat',    label:'SF color',   lo:'Grey',    hi:'Tinted',  min:0,  max:100, def:30  },
    { id:'bgSat',    label:'BG sat',     lo:'Neutral', hi:'Colored', min:0,  max:100, def:50  },
    { id:'popAccent',label:'Acc pop',    lo:'Subtle',  hi:'Bold',    min:0,  max:100, def:50  },
  ];

  const SLIDERS = [...SLIDERS_TYPE, ...SLIDERS_COLOR, ...SLIDERS_LAYOUT, ...SLIDERS_VIBE];

  const DEFAULTS = {
    axes:    { light:5, warm:35, vivid:70, airy:45, contrast:68, rich:52 },
    sliders: { ...Object.fromEntries(SLIDERS.map(s => [s.id, s.def])), fontPreset:0 },
    colorOverrides: {},
    customFont: '',
  };
  // Vibe defaults shorthand for preset definitions
  const VD = { organic:20, polish:65, energy:40, bgHue:0, sfSep:50, sfSat:30, bgSat:50, popAccent:50 };

  const BUILTIN_PRESETS = {
    'Dark Blue':     { axes:{light:5, warm:35,vivid:70,airy:45,contrast:68,rich:52},  sliders:{serif:0,scale:100,weight:40,leading:50,tracking:50,hRatio:55,h2Ratio:50,txOpacity:85,muOpacity:50,hue:217,accSat:70,colors:2,tint:30,accHueSplit:0,  radius:60,border:40,shadow:50,motion:30,density:50,iconScale:50, ...VD} },
    'Light':         { axes:{light:95,warm:40,vivid:55,airy:55,contrast:72,rich:42},  sliders:{serif:0,scale:100,weight:40,leading:50,tracking:50,hRatio:55,h2Ratio:50,txOpacity:92,muOpacity:55,hue:217,accSat:65,colors:2,tint:20,accHueSplit:0,  radius:60,border:35,shadow:30,motion:30,density:50,iconScale:50, ...VD,polish:70} },
    'High Contrast': { axes:{light:8, warm:35,vivid:92,airy:50,contrast:95,rich:65},  sliders:{serif:0,scale:100,weight:55,leading:50,tracking:50,hRatio:65,h2Ratio:55,txOpacity:100,muOpacity:65,hue:217,accSat:90,colors:2,tint:10,accHueSplit:0, radius:40,border:60,shadow:70,motion:20,density:45,iconScale:50, ...VD,polish:85,energy:60,popAccent:80} },
    'Monokai':       { axes:{light:10,warm:75,vivid:85,airy:45,contrast:75,rich:55},  sliders:{serif:0,scale:100,weight:40,leading:50,tracking:50,hRatio:55,h2Ratio:50,txOpacity:88,muOpacity:52,hue:45, accSat:80,colors:3,tint:40,accHueSplit:120,radius:30,border:35,shadow:60,motion:25,density:48,iconScale:50, ...VD,organic:15,energy:65,bgSat:55,popAccent:70} },
    'Solarized':     { axes:{light:28,warm:65,vivid:52,airy:55,contrast:62,rich:48},  sliders:{serif:0,scale:100,weight:40,leading:55,tracking:55,hRatio:50,h2Ratio:45,txOpacity:82,muOpacity:48,hue:192,accSat:60,colors:3,tint:35,accHueSplit:60, radius:50,border:30,shadow:40,motion:30,density:52,iconScale:50, ...VD,bgHue:-15,sfSat:40,bgSat:40} },
    'Classic Print': { axes:{light:93,warm:50,vivid:35,airy:60,contrast:82,rich:38},  sliders:{serif:85,scale:100,weight:45,leading:65,tracking:55,hRatio:60,h2Ratio:52,txOpacity:90,muOpacity:50,hue:210,accSat:40,colors:1,tint:10,accHueSplit:0,  radius:18,border:50,shadow:20,motion:15,density:55,iconScale:45, ...VD,organic:55,polish:80,energy:15,sfSat:5,bgSat:10} },
    'Dusk':          { axes:{light:18,warm:60,vivid:65,airy:50,contrast:70,rich:58},  sliders:{serif:0,scale:100,weight:40,leading:50,tracking:50,hRatio:55,h2Ratio:50,txOpacity:85,muOpacity:50,hue:280,accSat:75,colors:3,tint:45,accHueSplit:90, radius:55,border:35,shadow:60,motion:35,density:50,iconScale:50, ...VD,organic:35,energy:55,bgHue:20,sfSat:45,bgSat:45} },
    'Terminal':      { axes:{light:5, warm:50,vivid:80,airy:40,contrast:88,rich:45},  sliders:{serif:0,scale:100,weight:40,leading:48,tracking:50,hRatio:45,h2Ratio:42,txOpacity:88,muOpacity:45,hue:140,accSat:85,colors:1,tint:5, accHueSplit:0,  radius:4, border:55,shadow:35,motion:10,density:42,iconScale:48, ...VD,organic:5,polish:40,energy:30,bgSat:15,sfSat:10,popAccent:75} },
    'Notion':        { axes:{light:96,warm:42,vivid:38,airy:62,contrast:78,rich:35},  sliders:{serif:0,scale:100,weight:35,leading:65,tracking:48,hRatio:48,h2Ratio:44,txOpacity:90,muOpacity:52,hue:205,accSat:55,colors:1,tint:5, accHueSplit:0,  radius:8, border:30,shadow:18,motion:20,density:58,iconScale:45, ...VD,organic:25,polish:88,energy:20,bgSat:8,sfSat:8} },
    'Ocean':         { axes:{light:12,warm:25,vivid:68,airy:52,contrast:72,rich:55},  sliders:{serif:0,scale:100,weight:40,leading:52,tracking:50,hRatio:55,h2Ratio:50,txOpacity:85,muOpacity:50,hue:198,accSat:78,colors:2,tint:50,accHueSplit:45, radius:70,border:35,shadow:55,motion:40,density:50,iconScale:50, ...VD,organic:60,energy:45,bgHue:-10,sfSat:55,bgSat:55} },
    'Forest':        { axes:{light:14,warm:55,vivid:58,airy:55,contrast:68,rich:50},  sliders:{serif:0,scale:100,weight:40,leading:58,tracking:48,hRatio:52,h2Ratio:48,txOpacity:85,muOpacity:50,hue:145,accSat:65,colors:2,tint:45,accHueSplit:30, radius:65,border:30,shadow:50,motion:35,density:52,iconScale:50, organic:80,polish:55,energy:30,bgHue:10,sfSat:50,bgSat:48,popAccent:55} },
    'Neon City':     { axes:{light:5, warm:45,vivid:95,airy:42,contrast:85,rich:60},  sliders:{serif:0,scale:100,weight:50,leading:46,tracking:52,hRatio:58,h2Ratio:52,txOpacity:90,muOpacity:55,hue:295,accSat:95,colors:4,tint:15,accHueSplit:150,radius:35,border:45,shadow:75,motion:55,density:44,iconScale:55, organic:5,polish:60,energy:95,bgHue:15,sfSat:20,bgSat:25,popAccent:95} },
    'Parchment':     { axes:{light:88,warm:62,vivid:32,airy:58,contrast:70,rich:40},  sliders:{serif:75,scale:98, weight:40,leading:68,tracking:52,hRatio:58,h2Ratio:50,txOpacity:88,muOpacity:48,hue:38, accSat:45,colors:1,tint:25,accHueSplit:0,  radius:12,border:40,shadow:22,motion:18,density:55,iconScale:45, organic:70,polish:72,energy:12,bgHue:5,sfSat:35,bgSat:30,popAccent:40} },
  };

  // ─── Math ──────────────────────────────────────────────────────────────────
  const lerp  = (a,b,t) => a + (b-a)*Math.max(0,Math.min(1,t));
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const rad   = d => d*Math.PI/180;
  const hsl   = (h,s,l) => `hsl(${Math.round(((h%360)+360)%360)},${Math.round(clamp(s,0,100))}%,${Math.round(clamp(l,0,100))}%)`;
  const hsla  = (h,s,l,a) => a >= 0.995 ? hsl(h,s,l) : `hsla(${Math.round(((h%360)+360)%360)},${Math.round(clamp(s,0,100))}%,${Math.round(clamp(l,0,100))}%,${a.toFixed(2)})`;
  const dot   = (ax,ay,bx,by) => ax*bx+ay*by;

  function hslToHex(hslStr) {
    const m = hslStr.match(/hsla?\((\d+),\s*([\d.]+)%,\s*([\d.]+)%/);
    if (!m) return '#000000';
    let h = parseInt(m[1])/360, s = parseFloat(m[2])/100, l = parseFloat(m[3])/100;
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
      const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
      const h2 = (v,t) => { if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
      r=h2(p,h+1/3); g=h2(p,h); b=h2(p,h-1/3);
    }
    return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
  }

  // ─── CSS Computation ───────────────────────────────────────────────────────
  function computeTheme(st) {
    const { axes:ax, sliders:sl } = st;
    const L  = ax.light    / 100;
    const W  = ax.warm     / 100;
    const V  = ax.vivid    / 100;
    const A  = ax.airy     / 100;
    const C  = ax.contrast / 100;
    const R  = ax.rich     / 100;

    // Vibe modifiers
    const organic   = (sl.organic   ?? 20)  / 100;
    const polish    = (sl.polish    ?? 65)  / 100;
    const energy    = (sl.energy    ?? 40)  / 100;
    const bgHueShift= (sl.bgHue     ?? 0);           // degrees, raw
    const sfSep     = (sl.sfSep     ?? 50)  / 100;
    const sfSatMod  = (sl.sfSat     ?? 30)  / 100;
    const bgSatMod  = (sl.bgSat     ?? 50)  / 100;
    const popAccent = (sl.popAccent ?? 50)  / 100;

    // Organic shifts hue toward green-brown range, polish tightens saturation
    const baseHueOffset = lerp(0, 18, organic) - lerp(0, 8, polish);
    const bgH  = lerp(222, 210, L) + baseHueOffset + bgHueShift;
    // bgSat: bgSatMod scales overall BG saturation, organic adds warmth
    const bgSBase = lerp(42, 18, L);
    const bgS  = bgSBase * lerp(0.5, 1.4, bgSatMod) * lerp(1.0, 1.15, organic);
    const bgLv = lerp(6,98,L);
    // Surface separation: sfSep controls how much lighter surface is vs bg
    const sfLift = lerp(2, 8, sfSep);
    const sfLv = lerp(11,100,L) + (L < 0.5 ? sfLift : -sfLift*0.4);
    const s2Lv = lerp(14,97,L) + (L < 0.5 ? sfLift*1.6 : -sfLift*0.7);
    const dpLv = lerp(4,95,L)  - (L < 0.5 ? sfLift*0.4 : sfLift*0.2);
    const tint = (sl.tint/100) * lerp(0.5, 1.5, sfSatMod);  // sfSat amplifies tint
    const bw   = sl.border/100;

    const borLv  = lerp(lerp(lerp(11,18,tint),lerp(16,26,tint),R), lerp(lerp(80,85,tint),lerp(86,93,tint),R), L);
    const bor2Lv = lerp(lerp(lerp(14,22,tint),lerp(20,30,tint),R), lerp(lerp(76,82,tint),lerp(82,90,tint),R), L);
    const borderW = lerp(0.5,2.5,bw);

    // Text — opacity-driven for hi/text/muted/dim/ghost
    const txOp  = sl.txOpacity  / 100;
    const muOp  = sl.muOpacity  / 100;
    const hiLv  = lerp(lerp(88,96,C), lerp(4,14,C),  L) * lerp(0.9,1.0,txOp);
    const txLv  = lerp(lerp(74,86,C), lerp(12,22,C), L) * lerp(0.7,1.0,txOp);
    const t2Lv  = lerp(lerp(56,70,C), lerp(26,38,C), L) * lerp(0.6,1.0,txOp);
    const muLv  = lerp(lerp(40,52,C), lerp(38,48,C), L) * lerp(0.4,1.0,muOp);
    const diLv  = lerp(lerp(28,40,C), lerp(46,56,C), L) * lerp(0.3,1.0,muOp);
    const ghLv  = lerp(lerp(18,30,C), lerp(55,68,C), L) * lerp(0.25,0.9,muOp);

    const hueShift  = lerp(-28,28,W);
    const accH      = sl.hue + hueShift;
    const splitH    = accH + sl.accHueSplit;
    const accSatS   = sl.accSat/100;
    // popAccent amplifies saturation + contrast; energy pushes brightness extremes
    const accSatBoost = lerp(0.8, 1.25, popAccent);
    const accS      = lerp(20,96,V*accSatS) * accSatBoost;
    const accLvBase = lerp(lerp(38,52,V),lerp(44,58,V),L);
    const accLv     = accLvBase + lerp(-4, 6, energy) * (L < 0.5 ? 1 : -1);
    const abgLv     = lerp(lerp(9,18,V),lerp(78,88,V),L);
    const ahiLv     = lerp(lerp(62,80,V),lerp(18,32,V),L);
    const split2    = hsl(splitH, accS*0.85, lerp(lerp(42,56,V),lerp(40,54,V),L));

    const density   = sl.density/100;
    const spXs = `${lerp(lerp(3,5,density),lerp(6,12,density),A).toFixed(1)}px`;
    const spSm = `${lerp(lerp(6,10,density),lerp(10,20,density),A).toFixed(1)}px`;
    const spMd = `${lerp(lerp(10,16,density),lerp(16,32,density),A).toFixed(1)}px`;
    const spLg = `${lerp(lerp(16,24,density),lerp(24,48,density),A).toFixed(1)}px`;

    const rv = sl.radius/100;
    const rSmV  = lerp(0,6,rv);
    const rMdV  = lerp(0,18,rv);
    const rLgV  = lerp(0,32,rv);
    const pillV = lerp(0,50,rv);

    const fpIdx        = Math.round(clamp(sl.fontPreset ?? 0, 0, FONT_PRESETS.length-1));
    const fontFamily   = FONT_PRESETS[fpIdx].family || (st.customFont || FONT_PRESETS[0].family);
    const letterSpacing= `${lerp(-0.02,0.06,sl.tracking/100).toFixed(3)}em`;
    const lineHeight   = `${lerp(1.3,1.9,sl.leading/100).toFixed(2)}`;
    const fontSizePx   = `${Math.round(sl.scale*0.16)}px`;
    const fontWeight   = Math.round(lerp(300,800,sl.weight/100)/100)*100;

    // Heading ratios
    const h1Em  = lerp(1.2,3.0,sl.hRatio/100).toFixed(2);
    const h2Em  = lerp(1.0,2.0,sl.h2Ratio/100).toFixed(2);
    const h3Em  = (parseFloat(h2Em)*0.78).toFixed(2);

    // Icon scale
    const iconEm = lerp(0.85,1.35,sl.iconScale/100).toFixed(2);

    const shA = lerp(0.06,0.55,(R*0.4+(sl.shadow/100)*0.6));
    const shB = Math.round(lerp(2,36,sl.shadow/100));
    const shadow      = `0 ${Math.round(shB*0.35)}px ${shB}px rgba(0,0,0,${shA.toFixed(2)})`;
    const shadowHover = `0 ${Math.round(shB*0.6)}px ${Math.round(shB*1.5)}px rgba(0,0,0,${(shA*1.3).toFixed(2)})`;
    const motionMs    = Math.round(lerp(0,320,sl.motion/100));
    const transition  = `${motionMs}ms ease`;

    const surfA   = (sl.surfaceAlpha ?? 100) / 100;
    const glassBlurPx = lerp(0, 32, (sl.glassBlur ?? 0) / 100);

    const bg      = hsl(bgH,bgS,bgLv);
    const surface = hsla(bgH,bgS*0.95,sfLv, surfA);
    const surf2   = hsla(bgH,bgS*0.9,s2Lv,  surfA);
    const deep    = hsla(bgH,bgS*1.1,dpLv,  Math.max(0, surfA - 0.08));
    const border  = hsl(bgH,bgS*0.85,borLv);
    const border2 = hsl(bgH,bgS*0.8,bor2Lv);
    const hi      = hsl(bgH,bgS*0.4,hiLv);
    const text    = hsl(bgH,bgS*0.5,txLv);
    const text2   = hsl(bgH,bgS*0.45,t2Lv);
    const muted   = hsl(bgH,bgS*0.35,muLv);
    const dim     = hsl(bgH,bgS*0.3,diLv);
    const ghost   = hsl(bgH,bgS*0.25,ghLv);
    const accent  = hsl(accH,accS,accLv);
    const accBg   = hsl(accH,accS*0.75,abgLv);
    const accHi   = hsl(accH,accS*0.85,ahiLv);

    return {
      bg,surface,surf2,deep,border,border2,hi,text,text2,muted,dim,ghost,
      accent,accBg,accHi,split2,
      fontFamily,letterSpacing,lineHeight,fontSizePx,fontWeight,
      h1Em,h2Em,h3Em,iconEm,
      spXs,spSm,spMd,spLg,
      rSmV,rMdV,rLgV,pillV,borderW,
      shadow,shadowHover,transition,motionMs,
      glassBlurPx, surfA,
    };
  }

  function buildCSS(t, overrides) {
    const ov = overrides || {};
    const g  = (k, v) => ov[k] || v;
    return `
:root {
  --bg:${g('--bg',t.bg)}; --surface:${g('--surface',t.surface)}; --surface-2:${g('--surface-2',t.surf2)}; --deep:${g('--deep',t.deep)};
  --border:${t.border}; --border-2:${t.border2};
  --hi:${g('--hi',t.hi)}; --text:${g('--text',t.text)}; --text-2:${g('--text-2',t.text2)};
  --muted:${g('--muted',t.muted)}; --dim:${t.dim}; --ghost:${t.ghost};
  --accent:${g('--accent',t.accent)}; --acc-bg:${g('--acc-bg',t.accBg)}; --acc-hi:${g('--acc-hi',t.accHi)}; --accent-2:${g('--accent-2',t.split2)};
  --r-sm:${t.rSmV.toFixed(1)}px; --r:${t.rMdV.toFixed(1)}px;
  --r-lg:${t.rLgV.toFixed(1)}px; --pill:${t.pillV.toFixed(1)}px;
  --border-w:${t.borderW.toFixed(2)}px;
  --sp-xs:${t.spXs}; --sp-sm:${t.spSm}; --sp-md:${t.spMd}; --sp-lg:${t.spLg};
  --shadow:${t.shadow}; --shadow-hover:${t.shadowHover};
  --transition:${t.transition}; --line-height:${t.lineHeight};
  --h1-size:${t.h1Em}em; --h2-size:${t.h2Em}em; --h3-size:${t.h3Em}em;
  --icon-scale:${t.iconEm}em;
  --glass-blur:${t.glassBlurPx.toFixed(1)}px;
  font-size:${t.fontSizePx};
  /* ── NTCH aliases — maps theme studio vars to NTCH component variable names ── */
  --color-primary:   ${g('--accent',t.accent)};
  --color-secondary: ${t.split2};
  --color-accent:    ${g('--acc-hi',t.accHi)};
  --color-text:      ${g('--text',t.text)};
  --color-bg:        ${g('--bg',t.bg)};
  --color-surface:   ${g('--surface',t.surface)};
  --color-muted:     ${g('--muted',t.muted)};
  --color-white:     #ffffff;
  --color-footer:    ${g('--deep',t.deep)};
  --font-heading:    'Cormorant Garamond', Georgia, serif;
  --font-body:       ${t.fontFamily};
  --spacing-unit:    ${(parseFloat(t.spMd)/3).toFixed(1)}px;
  --radius:          ${t.rSmV.toFixed(1)}px;
  --radius-lg:       ${t.rLgV.toFixed(1)}px;
  --max-width:       1200px;
  --max-width-text:  680px;
  --ease:            cubic-bezier(0.4, 0, 0.2, 1);
  --dur:             ${t.motionMs}ms;
}
body {
  background:${g('--bg',t.bg)} !important;
  color:${g('--text',t.text)} !important;
  font-family:${t.fontFamily};
  letter-spacing:${t.letterSpacing};
  line-height:${t.lineHeight};
  font-weight:${t.fontWeight};
  transition:background ${t.transition},color ${t.transition};
}
`;
  }

  // ─── State & Storage ───────────────────────────────────────────────────────
  let state       = loadState();
  let history     = loadHistory();
  let histIdx     = history.length-1;
  let userPresets = loadUserPresets();

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function deepEq(a,b)  { return JSON.stringify(a)===JSON.stringify(b); }

  function ensureDefaults(st) {
    if (!st.axes)           st.axes           = {};
    if (!st.sliders)        st.sliders        = {};
    if (!st.colorOverrides) st.colorOverrides = {};
    if (st.customFont === undefined) st.customFont = '';
    AXES.forEach(a => { if (st.axes[a.id]    === undefined) st.axes[a.id]    = DEFAULTS.axes[a.id]; });
    SLIDERS.forEach(s => { if (st.sliders[s.id] === undefined) st.sliders[s.id] = s.def; });
    if (st.sliders.fontPreset === undefined) st.sliders.fontPreset = 0;
    return st;
  }

  function loadState()       { try { const s=JSON.parse(localStorage.getItem(LS_STATE));   if (s?.axes) return ensureDefaults(s); } catch {} return deepClone(DEFAULTS); }
  function saveState()       { try { localStorage.setItem(LS_STATE,   JSON.stringify(state));       } catch {} }
  function loadHistory()     { try { const h=JSON.parse(localStorage.getItem(LS_HIST));    if (Array.isArray(h)) return h.map(ensureDefaults); } catch {} return [deepClone(DEFAULTS)]; }
  function saveHistory()     { try { localStorage.setItem(LS_HIST,    JSON.stringify(history));     } catch {} }
  function loadUserPresets() { try { const p=JSON.parse(localStorage.getItem(LS_PRESETS)); if (p) return p; } catch {} return {}; }
  function saveUserPresets() { try { localStorage.setItem(LS_PRESETS, JSON.stringify(userPresets)); } catch {} }

  function pushHistory(snapshot) {
    if (histIdx < history.length-1) history = history.slice(0,histIdx+1);
    if (!deepEq(snapshot, history[history.length-1])) {
      history.push(deepClone(snapshot));
      if (history.length>MAX_HIST) history.shift();
      histIdx = history.length-1;
      saveHistory();
    }
  }
  function undo() { if (histIdx>0)               { histIdx--; state=deepClone(history[histIdx]); applyAndSync(false); } }
  function redo() { if (histIdx<history.length-1) { histIdx++; state=deepClone(history[histIdx]); applyAndSync(false); } }

  // ─── Apply ─────────────────────────────────────────────────────────────────
  let styleEl = null;
  function applyTheme(st) {
    if (!styleEl) { styleEl=document.createElement('style'); styleEl.id='tc-override'; document.head.appendChild(styleEl); }
    styleEl.textContent = buildCSS(computeTheme(st), st.colorOverrides);
  }

  let bc = null;
  if (getMode() === 'dev') {
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.onmessage = e => { if (e.data?.type==='theme') { state=ensureDefaults(e.data.state); applyTheme(state); saveState(); syncUI(); } };
    } catch {}
  }

  function applyAndSync(broadcast=true) {
    applyTheme(state); saveState(); syncUI();
    if (broadcast && bc) bc.postMessage({type:'theme',state:deepClone(state)});
  }
  applyTheme(state);

  // ─── Swatch mini (for history tooltip) ────────────────────────────────────
  function miniSwatchHTML(st) {
    const t = computeTheme(st);
    return [t.bg,t.surface,t.surf2,t.text,t.muted,t.accent,t.accBg,t.accHi]
      .map(c=>`<span style="flex:1;background:${c};height:100%"></span>`).join('');
  }

  function histLabel(st) {
    const all = {...BUILTIN_PRESETS,...userPresets};
    for (const [name,p] of Object.entries(all)) { if (deepEq(p,st)) return name; }
    return null;
  }

  // ─── Panel CSS ─────────────────────────────────────────────────────────────
  const panelCSS = `
#tc-fab {
  position:fixed; bottom:22px; right:22px; z-index:99998;
  width:44px; height:44px; border-radius:50%;
  background:var(--surface,#131929); border:1.5px solid var(--border-2,#1e2a45);
  box-shadow:0 4px 18px rgba(0,0,0,.45);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; font-size:19px; transition:transform .15s,box-shadow .15s;
  user-select:none; color:var(--text,#cbd5e1);
}
#tc-fab:hover { transform:scale(1.08); box-shadow:0 6px 24px rgba(0,0,0,.55); }
#tc-fab.open  { background:#3a5a78; color:#dce9f5; border-color:transparent; }

#tc-root {
  position:fixed; bottom:76px; right:22px; z-index:99999;
  width:384px; background:var(--surface,#131929);
  border:1px solid var(--border-2,#1e2a45);
  border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.6);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:12px; color:var(--text,#cbd5e1);
  display:none; flex-direction:column; overflow:hidden;
  max-height:calc(100vh - 110px);
  resize:both; min-width:330px; min-height:300px;
  /* Neutral panel accent — fixed, not theme-driven */
  --pa:#4e7a9b; --pa-dim:#152232; --pa-lit:#8ab4cc;
}
#tc-root.visible { display:flex; }
/* Prevent text selection during drag */
#tc-root * { user-select:none; -webkit-user-select:none; }
#tc-root input, #tc-root textarea { user-select:text; -webkit-user-select:text; }
#tc-root.dock-right  { bottom:0;right:0;top:0;width:390px;height:100vh;max-height:100vh;border-radius:0;border-right:none;border-top:none;border-bottom:none;resize:horizontal; }
#tc-root.dock-bottom { bottom:0;left:0;right:0;width:100vw;height:320px;max-height:40vh;border-radius:0;border-left:none;border-right:none;border-bottom:none;resize:vertical;min-width:100vw; }

#tc-header {
  display:flex; align-items:center; gap:5px; padding:9px 12px 8px;
  border-bottom:1px solid var(--border,#1a2236);
  background:var(--surface-2,#1a2035); cursor:move; flex-shrink:0;
}
#tc-header .tc-title { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--hi,#f1f5f9); flex:1; }
.tc-icon-btn {
  background:none; border:none; color:var(--dim,#475569); cursor:pointer;
  font-size:13px; padding:3px 5px; border-radius:5px; line-height:1;
  transition:color .12s,background .12s;
}
.tc-icon-btn:hover { color:var(--text,#cbd5e1); background:var(--surface,#131929); }
.tc-icon-btn.active { color:var(--pa-lit,#8ab4cc); }
#tc-unsaved {
  font-size:8.5px; font-weight:700; padding:1px 6px; border-radius:10px;
  background:#451a03; color:#fbbf24; letter-spacing:.05em; opacity:0; transition:opacity .2s;
}
#tc-unsaved.visible { opacity:1; }

#tc-body { overflow-y:auto; flex:1; padding:12px 14px; display:flex; flex-direction:column; gap:12px; }
#tc-body::-webkit-scrollbar { width:4px; }
#tc-body::-webkit-scrollbar-thumb { background:var(--ghost,#334155); border-radius:2px; }

.tc-section-label {
  font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  color:var(--dim,#475569); margin-bottom:5px;
}

/* ─ Starburst ─ */
#tc-starburst-wrap { display:flex; flex-direction:column; align-items:center; position:relative; }
#tc-svg { overflow:visible; cursor:crosshair; user-select:none; -webkit-user-select:none; }
.tc-axis-line  { stroke:var(--border-2,#1e2a45); stroke-width:1; }
.tc-axis-hit   { stroke:transparent; stroke-width:14; cursor:pointer; }
.tc-axis-ring  { fill:none; stroke:var(--border,#1a2236); stroke-width:.5; }
.tc-poly       { fill:var(--accent,#2563eb); fill-opacity:.15; stroke:var(--accent,#2563eb); stroke-width:1.5; stroke-linejoin:round; }
.tc-handle     { fill:var(--accent,#2563eb); stroke:var(--surface,#131929); stroke-width:2; cursor:grab; r:6; transition:r .1s; }
.tc-handle:hover { r:9; }
.tc-handle:active { cursor:grabbing; }
.tc-axis-label { font-size:9.5px; fill:var(--dim,#475569); text-anchor:middle; dominant-baseline:central; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.tc-axis-label.outer { fill:var(--muted,#64748b); font-weight:600; cursor:pointer; pointer-events:all; }
.tc-axis-label.outer:hover { fill:var(--accent,#2563eb); }
/* Axis value display per axis */
.tc-axis-val {
  font-size:8px; fill:var(--muted,#64748b); text-anchor:middle; dominant-baseline:central;
  pointer-events:none; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  transition:opacity .15s;
}
/* Drag value popup */
#tc-axis-tip {
  position:absolute; top:2px; left:50%; transform:translateX(-50%);
  font-size:10px; font-weight:700; color:var(--hi,#f1f5f9);
  background:var(--acc-bg,#1e3a8a); border:1px solid var(--accent,#2563eb);
  border-radius:6px; padding:2px 9px; pointer-events:none;
  opacity:0; transition:opacity .1s; white-space:nowrap;
}
#tc-axis-tip.visible { opacity:1; }

/* ─ Tabs ─ */
.tc-tabs { display:flex; gap:4px; margin-bottom:8px; }
.tc-tab {
  font-size:9px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
  padding:3px 10px; border-radius:20px; cursor:pointer;
  background:var(--surface-2,#1a2035); color:var(--dim,#475569);
  border:1px solid var(--border-2,#1e2a45); font-family:inherit; transition:all .12s;
}
.tc-tab.active { background:var(--pa-dim,#152232); color:var(--pa-lit,#8ab4cc); border-color:var(--pa,#4e7a9b); }

/* ─ Sliders ─ */
.tc-slider-row { display:grid; grid-template-columns:62px 1fr 38px; align-items:center; gap:6px; margin-bottom:6px; }
.tc-slider-label { font-size:9.5px; color:var(--dim,#475569); white-space:nowrap; cursor:pointer; }
.tc-slider-label:hover { color:var(--muted,#64748b); }
.tc-slider-ends  { display:flex; justify-content:space-between; font-size:8px; color:var(--ghost,#334155); }
.tc-range-wrap   { position:relative; }
.tc-range {
  width:100%; height:4px; cursor:pointer;
  -webkit-appearance:none; appearance:none;
  background:linear-gradient(to right,var(--pa,#4e7a9b) 0%,var(--pa,#4e7a9b) var(--pct,50%),var(--border-2,#1e2a45) var(--pct,50%));
  border-radius:2px; outline:none;
}
.tc-range::-webkit-slider-thumb {
  -webkit-appearance:none; width:12px; height:12px; border-radius:50%;
  background:var(--pa-lit,#8ab4cc); border:2px solid var(--surface,#131929);
  cursor:grab; transition:transform .12s;
}
.tc-range::-webkit-slider-thumb:active { cursor:grabbing; transform:scale(1.25); }
.tc-range::-moz-range-thumb { width:10px; height:10px; border-radius:50%; background:var(--pa-lit,#8ab4cc); border:2px solid var(--surface,#131929); cursor:grab; }
.tc-slider-val { font-size:9.5px; color:var(--muted,#64748b); text-align:right; font-variant-numeric:tabular-nums; }
.tc-range.hue-range {
  background:linear-gradient(to right,hsl(0,80%,50%),hsl(45,80%,50%),hsl(90,80%,50%),hsl(135,80%,50%),hsl(180,80%,50%),hsl(225,80%,50%),hsl(270,80%,50%),hsl(315,80%,50%),hsl(360,80%,50%)) !important;
}
.tc-range.hue-range::-webkit-slider-thumb { background:hsl(var(--hue-h,217),80%,60%); }

/* ─ Presets ─ */
.tc-presets-grid { display:flex; flex-wrap:wrap; gap:5px; }
.tc-preset-pill {
  font-size:10px; padding:3px 9px; border-radius:20px; cursor:pointer;
  background:var(--surface-2,#1a2035); color:var(--muted,#64748b);
  border:1px solid var(--border-2,#1e2a45);
  transition:all .12s; white-space:nowrap; font-family:inherit;
}
.tc-preset-pill:hover { color:var(--text,#cbd5e1); border-color:var(--ghost,#334155); }
.tc-preset-pill.active { background:var(--pa-dim,#152232); color:var(--pa-lit,#8ab4cc); border-color:var(--pa,#4e7a9b); }
.tc-preset-pill.user { border-style:dashed; }
.tc-preset-pill .tc-del { margin-left:5px; opacity:.4; }
.tc-preset-pill:hover .tc-del { opacity:.8; }

/* ─ Swatch ─ */
#tc-swatch { display:grid; grid-template-columns:repeat(8,1fr); gap:3px; border-radius:6px; overflow:hidden; height:16px; flex-shrink:0; }
#tc-swatch span { display:block; height:100%; }

/* ─ History ─ */
#tc-hist-scroll {
  overflow-x:auto; overflow-y:hidden; padding-bottom:4px;
  scrollbar-width:thin; scrollbar-color:var(--ghost,#334155) transparent;
}
#tc-hist-scroll::-webkit-scrollbar { height:3px; }
#tc-hist-scroll::-webkit-scrollbar-thumb { background:var(--ghost,#334155); border-radius:2px; }
#tc-hist-bar { display:flex; align-items:center; gap:5px; padding:4px 2px; min-width:max-content; }
.tc-hist-dot {
  width:9px; height:9px; border-radius:50%; background:var(--ghost,#334155);
  cursor:pointer; flex-shrink:0; transition:background .1s,transform .12s;
  position:relative;
}
.tc-hist-dot:hover   { transform:scale(1.5); }
.tc-hist-dot.cur     { background:var(--pa,#4e7a9b); width:11px; height:11px; }
/* Tooltip */
.tc-hist-tip {
  position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%);
  background:var(--surface-2,#1a2035); border:1px solid var(--border-2,#1e2a45);
  border-radius:8px; padding:7px 9px; pointer-events:none;
  display:none; flex-direction:column; gap:5px; z-index:10000;
  width:120px; box-shadow:0 4px 16px rgba(0,0,0,.5);
}
.tc-hist-tip::after {
  content:''; position:absolute; bottom:-5px; left:50%; transform:translateX(-50%);
  border:5px solid transparent; border-top-color:var(--border-2,#1e2a45);
}
.tc-hist-dot:hover .tc-hist-tip { display:flex; }
.tc-hist-swatch { display:flex; height:12px; border-radius:3px; overflow:hidden; }
.tc-hist-name   { font-size:8.5px; font-weight:700; color:var(--acc-hi,#93c5fd); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tc-hist-axes   { display:grid; grid-template-columns:1fr 1fr; gap:2px; }
.tc-hist-ax     { font-size:7.5px; color:var(--dim,#475569); display:flex; justify-content:space-between; gap:4px; }
.tc-hist-ax span{ color:var(--muted,#64748b); font-variant-numeric:tabular-nums; }
.tc-hist-step   { font-size:7.5px; color:var(--ghost,#334155); text-align:right; }

/* ─ Footer ─ */
#tc-footer { display:flex; align-items:center; gap:6px; padding:8px 12px; border-top:1px solid var(--border,#1a2236); flex-shrink:0; flex-wrap:wrap; }
.tc-btn {
  font-size:10px; padding:4px 10px; border-radius:6px; cursor:pointer;
  background:var(--surface-2,#1a2035); color:var(--muted,#64748b);
  border:1px solid var(--border-2,#1e2a45); font-family:inherit; transition:all .12s; white-space:nowrap;
}
.tc-btn:hover   { color:var(--text,#cbd5e1); border-color:var(--ghost,#334155); }
.tc-btn.primary { background:var(--pa,#4e7a9b); color:#dce9f5; border-color:transparent; }
.tc-btn.primary:hover { filter:brightness(1.15); }
.tc-btn.danger  { color:#f87171; border-color:#7f1d1d; }
.tc-btn.danger:hover { background:#450a0a; }
.tc-spacer { flex:1; }

/* ─ Accordion ─ */
#tc-accordion { display:flex; flex-direction:column; }
.tc-acc-hd {
  display:flex; align-items:center; gap:6px; padding:7px 14px;
  cursor:pointer; border-bottom:1px solid var(--border,#1a2236);
  background:var(--surface-2,#1a2035);
  font-size:9.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:var(--dim,#475569); user-select:none; transition:color .12s;
}
.tc-acc-hd:hover { color:var(--muted,#64748b); background:var(--surface,#131929); }
.tc-acc-hd.open  { color:var(--text,#cbd5e1); background:var(--surface,#131929); }
.tc-acc-arrow { font-size:7px; transition:transform .15s; margin-left:auto; }
.tc-acc-hd.open .tc-acc-arrow { transform:rotate(90deg); }
.tc-acc-body { display:none; padding:8px 14px 10px; border-bottom:1px solid var(--border,#1a2236); }
.tc-acc-hd.open ~ .tc-acc-body { display:block; }
.tc-sub-lbl {
  font-size:8px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  color:var(--ghost,#334155); margin:10px 0 5px; display:flex; align-items:center; gap:6px;
}
.tc-sub-lbl::after { content:''; flex:1; height:1px; background:var(--border,#1a2236); }

/* ─ Font picker ─ */
.tc-font-picks { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
.tc-font-pill {
  font-size:9.5px; padding:3px 8px; border-radius:20px; cursor:pointer;
  background:var(--surface-2,#1a2035); color:var(--muted,#64748b);
  border:1px solid var(--border-2,#1e2a45); font-family:inherit; transition:all .12s;
}
.tc-font-pill:hover { color:var(--text,#cbd5e1); border-color:var(--ghost,#334155); }
.tc-font-pill.active { background:var(--pa-dim,#152232); color:var(--pa-lit,#8ab4cc); border-color:var(--pa,#4e7a9b); }
#tc-custom-font-row { display:none; margin-bottom:6px; }
#tc-custom-font-row.visible { display:flex; }
#tc-custom-font {
  flex:1; background:var(--surface-2,#1a2035); border:1px solid var(--border-2,#1e2a45);
  border-radius:5px; padding:4px 8px; color:var(--muted,#64748b);
  font-size:10px; font-family:inherit; outline:none; user-select:text; -webkit-user-select:text;
}
#tc-custom-font:focus { border-color:var(--pa,#4e7a9b); color:var(--text,#cbd5e1); }

/* ─ Harmony wheel ─ */
.tc-hw-wrap { display:flex; gap:10px; align-items:center; margin-bottom:10px; }
.tc-hw-ring {
  width:72px; height:72px; border-radius:50%; flex-shrink:0; position:relative;
  background:conic-gradient(hsl(0,65%,50%),hsl(60,65%,50%),hsl(120,65%,50%),hsl(180,65%,50%),hsl(240,65%,50%),hsl(300,65%,50%),hsl(360,65%,50%));
}
.tc-hw-hole {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  width:46px; height:46px; border-radius:50%; background:var(--surface-2,#1a2035);
}
.tc-hw-dot {
  position:absolute; width:9px; height:9px; border-radius:50%;
  transform:translate(-50%,-50%); border:2px solid var(--surface,#131929); pointer-events:none;
}
.tc-hw-legend { display:flex; flex-direction:column; gap:5px; flex:1; min-width:0; }
.tc-hw-legend-item { display:flex; align-items:center; gap:5px; font-size:8.5px; color:var(--dim,#475569); }
.tc-hw-legend-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.tc-hw-legend-lbl { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tc-hw-legend-hex { font-size:8px; font-family:monospace; color:var(--ghost,#334155); }

/* ─ Color tokens ─ */
.tc-color-token { display:flex; align-items:center; gap:5px; margin-bottom:5px; }
.tc-token-chip {
  width:22px; height:22px; border-radius:3px; border:0; padding:0;
  flex-shrink:0; cursor:pointer; outline:1px solid var(--border-2,#1e2a45);
  outline-offset:1px;
}
.tc-token-name { font-size:8.5px; color:var(--dim,#475569); width:58px; flex-shrink:0; }
.tc-token-hex {
  flex:1; min-width:0; background:var(--surface-2,#1a2035); border:1px solid var(--border-2,#1e2a45);
  border-radius:4px; padding:2px 5px; color:var(--muted,#64748b);
  font-size:9px; font-family:monospace; outline:none; cursor:text;
  user-select:text; -webkit-user-select:text;
}
.tc-token-hex:focus { border-color:var(--pa,#4e7a9b); color:var(--text,#cbd5e1); }
.tc-token-hex.ov { border-color:var(--pa,#4e7a9b); color:var(--pa-lit,#8ab4cc); }
.tc-token-lock {
  background:none; border:none; cursor:pointer; padding:2px; font-size:11px;
  color:var(--ghost,#334155); transition:color .1s; flex-shrink:0; line-height:1;
}
.tc-token-lock.locked { color:var(--pa-lit,#8ab4cc); }

/* ─ Help overlay ─ */
#tc-help-overlay {
  position:absolute; inset:0; z-index:10; background:rgba(9,12,18,.88);
  display:flex; align-items:center; justify-content:center; border-radius:14px;
}
#tc-help-box {
  background:var(--surface-2,#1a2035); border:1px solid var(--border-2,#1e2a45);
  border-radius:10px; padding:14px 16px; width:calc(100% - 40px); max-width:320px;
  position:relative;
}
.tc-help-title { font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--pa-lit,#8ab4cc); margin-bottom:8px; }
.tc-help-grid { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; font-size:10px; }
.tc-help-key { color:var(--muted,#64748b); font-family:monospace; font-size:9.5px; white-space:nowrap; }

/* ─ Panel light mode ─ */
#tc-root.tc-panel-light {
  --bg:#d8e4f0; --surface:#e8f0f8; --surface-2:#dde8f4;
  --border:#b8ccdf; --border-2:#a8bcd4;
  --hi:#1a2840; --text:#2c3e58; --text-2:#3d5272;
  --muted:#4a6282; --dim:#607898; --ghost:#8098b4;
  background:var(--surface,#e8f0f8) !important;
  color:var(--text,#2c3e58) !important;
}
#tc-root.tc-panel-light #tc-header { background:var(--surface-2,#dde8f4); }
#tc-root.tc-panel-light #tc-body   { background:var(--surface,#e8f0f8); }
.pro-pill {
  background: var(--accent);
  color: white;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  position: absolute;
  top: 4px;
  right: 4px;
}
.control--locked {
  pointer-events: none;
  opacity: 0.4;
  filter: grayscale(0.5);
  position: relative;
}
`;

  const styleTag = document.createElement('style');
  styleTag.textContent = panelCSS;
  document.head.appendChild(styleTag);

  // ─── Panel DOM ─────────────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.id='tc-fab'; fab.title='Theme Controls'; fab.textContent='🎨';
  document.body.appendChild(fab);

  const root = document.createElement('div');
  root.id='tc-root';
  root.innerHTML = `
<div id="tc-header">
  <span class="tc-title">Theme</span>
  <span id="tc-unsaved">unsaved</span>
  <button class="tc-icon-btn" id="tc-undo" title="Undo (⌘Z)">↩</button>
  <button class="tc-icon-btn" id="tc-redo" title="Redo">↪</button>
  <button class="tc-icon-btn" id="tc-ldtoggle" title="Toggle light / dark">☀</button>
  <button class="tc-icon-btn" id="tc-panel-mode" title="Panel brightness">◐</button>
  <button class="tc-icon-btn" id="tc-help" title="Keyboard shortcuts">?</button>
  <button class="tc-icon-btn" id="tc-dock-float" title="Float">⊡</button>
  <button class="tc-icon-btn" id="tc-dock-right" title="Dock right">▶</button>
  <button class="tc-icon-btn" id="tc-dock-bottom" title="Dock bottom">▼</button>
  <button class="tc-icon-btn" id="tc-close" title="Close (Esc)">✕</button>
</div>
<div id="tc-help-overlay" style="display:none">
  <div id="tc-help-box">
    <div class="tc-help-title">Keyboard Shortcuts</div>
    <div class="tc-help-grid">
      <span class="tc-help-key">⌘Z / Ctrl Z</span><span>Undo</span>
      <span class="tc-help-key">⌘⇧Z / Ctrl Y</span><span>Redo</span>
      <span class="tc-help-key">← → hover slider</span><span>Nudge ±1</span>
      <span class="tc-help-key">⇧ + ← →</span><span>Nudge ±10</span>
      <span class="tc-help-key">↑ ↓ on handle</span><span>Axis ±1</span>
      <span class="tc-help-key">Esc</span><span>Close panel</span>
      <span class="tc-help-key">Dbl-click label</span><span>Reset to default</span>
    </div>
    <div class="tc-help-title" style="margin-top:8px">Inspector (Theme Studio)</div>
    <div class="tc-help-grid">
      <span class="tc-help-key">I</span><span>Toggle inspect mode</span>
      <span class="tc-help-key">Esc</span><span>Close popup / exit</span>
    </div>
    <button class="tc-btn" id="tc-help-close" style="margin-top:10px;width:100%">Close</button>
  </div>
</div>
<div id="tc-body">
  <div style="padding:8px 14px 4px">
    <div class="tc-section-label">Style axes — drag handle · drag polygon · click axis line · dbl-click label resets</div>
    <div id="tc-starburst-wrap">
      <div id="tc-axis-tip"></div>
      <svg id="tc-svg" viewBox="0 0 260 260" width="220" height="220"></svg>
    </div>
  </div>
  <div id="tc-accordion"></div>
  <div style="padding:8px 14px 4px">
    <div class="tc-section-label">Presets</div>
    <div class="tc-presets-grid" id="tc-presets"></div>
  </div>
  <div style="padding:4px 14px 8px">
    <div class="tc-section-label">History · hover preview · click jump · right-click revert</div>
    <div id="tc-hist-scroll"><div id="tc-hist-bar"></div></div>
  </div>
  <div id="tc-swatch"></div>
</div>
<div id="tc-footer">
  <button class="tc-btn" id="tc-reset">Reset</button>
  <button class="tc-btn" id="tc-save-preset">Save</button>
  <button class="tc-btn" id="tc-export">Export CSS</button>
  <label class="tc-btn" style="cursor:pointer">Import<input type="file" accept=".json" id="tc-import-file" style="display:none"></label>
  <span class="tc-spacer"></span>
  <button class="tc-btn primary" id="tc-apply-all">Apply All</button>
</div>
`;
  document.body.appendChild(root);

  // ─── Starburst ─────────────────────────────────────────────────────────────
  const svg     = root.querySelector('#tc-svg');
  const axisTip = root.querySelector('#tc-axis-tip');
  let   axisValEls = {};

  function axisXY(ax,frac) {
    const a=rad(ax.deg);
    return [SVG_CX+frac*SVG_R*Math.cos(a), SVG_CY+frac*SVG_R*Math.sin(a)];
  }

  function buildStarburst() {
    svg.innerHTML=''; axisValEls={};
    // Guide rings
    [0.25,0.5,0.75,1].forEach(f => {
      const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
      poly.setAttribute('points',AXES.map(ax=>axisXY(ax,f).join(',')).join(' '));
      poly.setAttribute('class','tc-axis-ring'); svg.appendChild(poly);
    });
    // Axes + hit areas + labels
    AXES.forEach(ax => {
      const [x1,y1]=axisXY(ax,0), [x2,y2]=axisXY(ax,1);

      // Visible line
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      line.setAttribute('class','tc-axis-line'); svg.appendChild(line);

      // Wide transparent hit area for the full axis (click anywhere on line)
      const hit=document.createElementNS('http://www.w3.org/2000/svg','line');
      hit.setAttribute('x1',x1); hit.setAttribute('y1',y1);
      hit.setAttribute('x2',x2); hit.setAttribute('y2',y2);
      hit.setAttribute('class','tc-axis-hit'); hit.dataset.axis=ax.id;
      svg.appendChild(hit);

      // Outer label — single click shows value, dbl-click resets
      const [lx,ly]=axisXY(ax,1.18);
      const lbl=document.createElementNS('http://www.w3.org/2000/svg','text');
      lbl.setAttribute('x',lx); lbl.setAttribute('y',ly);
      lbl.setAttribute('class','tc-axis-label outer'); lbl.dataset.axis=ax.id;
      lbl.textContent=ax.label;
      lbl.addEventListener('click', () => showAxisTip(ax, state.axes[ax.id]));
      lbl.addEventListener('dblclick', () => { state.axes[ax.id]=50; updateStarburst(); applyAndSync(); pushHistory(state); });
      svg.appendChild(lbl);

      // Inner neg label
      const [ix,iy]=axisXY(ax,-0.18);
      const neg=document.createElementNS('http://www.w3.org/2000/svg','text');
      neg.setAttribute('x',ix); neg.setAttribute('y',iy);
      neg.setAttribute('class','tc-axis-label'); neg.setAttribute('font-size','8');
      neg.textContent=ax.neg; svg.appendChild(neg);

      // Per-axis value (small, always visible near handle)
      const valT=document.createElementNS('http://www.w3.org/2000/svg','text');
      valT.setAttribute('class','tc-axis-val'); valT.dataset.axisval=ax.id;
      svg.appendChild(valT); axisValEls[ax.id]=valT;
    });

    // Polygon
    const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.id='tc-poly'; poly.setAttribute('class','tc-poly'); svg.appendChild(poly);

    // Handles (on top)
    AXES.forEach(ax => {
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('class','tc-handle'); c.setAttribute('data-axis',ax.id);
      c.setAttribute('tabindex','0'); c.setAttribute('role','slider'); c.setAttribute('aria-label',ax.label);
      svg.appendChild(c);
    });

    updateStarburst();
    attachStarburstDrag();
  }

  function showAxisTip(ax, val) {
    axisTip.textContent=`${ax.label}: ${val}`;
    axisTip.classList.add('visible');
    clearTimeout(axisTip._t);
    axisTip._t=setTimeout(()=>axisTip.classList.remove('visible'),1200);
  }

  function updateStarburst() {
    // Sync starburst accent to live theme (:root), overriding any panel lock
    const cs = getComputedStyle(document.documentElement);
    const wrap = root.querySelector('#tc-starburst-wrap');
    ['--accent','--acc-bg','--acc-hi'].forEach(v => {
      const val = cs.getPropertyValue(v).trim();
      if (val) wrap.style.setProperty(v, val);
    });

    const pts=AXES.map(ax=>axisXY(ax,state.axes[ax.id]/100));
    svg.querySelector('#tc-poly').setAttribute('points',pts.map(p=>p.join(',')).join(' '));
    svg.querySelectorAll('.tc-handle').forEach(h => {
      const ax=AXES.find(a=>a.id===h.dataset.axis);
      const [x,y]=axisXY(ax,state.axes[ax.id]/100);
      h.setAttribute('cx',x); h.setAttribute('cy',y);
      h.setAttribute('aria-valuenow',state.axes[ax.id]);
    });
    // Update per-axis value labels — offset slightly from handle toward outer
    AXES.forEach(ax => {
      const v=state.axes[ax.id];
      const frac=v/100;
      const [hx,hy]=axisXY(ax,frac);
      const [ox,oy]=axisXY(ax,frac+0.16);
      const el=axisValEls[ax.id]; if (!el) return;
      el.setAttribute('x',ox); el.setAttribute('y',oy);
      el.textContent=v;
    });
  }

  function projectToAxis(ax, mx, my) {
    const a=rad(ax.deg);
    const proj=dot(mx-SVG_CX,my-SVG_CY,Math.cos(a),Math.sin(a));
    return clamp(Math.round(proj/SVG_R*100),0,100);
  }

  function attachStarburstDrag() {
    let dragging   = null;   // axis id — single handle drag
    let freeOrigin = null;   // {mx,my,snapshot} — polygon freeform drag

    function svgCoords(e) {
      const rect = svg.getBoundingClientRect();
      return [(e.clientX - rect.left) * (260/rect.width),
              (e.clientY - rect.top)  * (260/rect.height)];
    }

    // ── Click on axis hit-line → snap that axis ──────────────────────────────
    svg.addEventListener('click', e => {
      const hit = e.target.closest('.tc-axis-hit');
      if (!hit || dragging || freeOrigin) return;
      const ax = AXES.find(a => a.id === hit.dataset.axis); if (!ax) return;
      const [mx,my] = svgCoords(e);
      state.axes[ax.id] = projectToAxis(ax, mx, my);
      updateStarburst(); applyAndSync(); pushHistory(state);
      showAxisTip(ax, state.axes[ax.id]);
    });

    // ── Pointerdown: handle drag OR polygon freeform ─────────────────────────
    svg.addEventListener('pointerdown', e => {
      const h    = e.target.closest('.tc-handle');
      const poly = e.target.closest('#tc-poly');

      if (h) {
        // Single-handle drag
        dragging = h.dataset.axis;
        h.setPointerCapture(e.pointerId);
        e.preventDefault();
      } else if (poly) {
        // Freeform polygon drag — snapshot current axes, record start point
        const [mx,my] = svgCoords(e);
        freeOrigin = { mx, my, snapshot: { ...state.axes } };
        poly.setPointerCapture(e.pointerId);
        svg.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    // ── Pointermove ──────────────────────────────────────────────────────────
    svg.addEventListener('pointermove', e => {
      if (dragging) {
        // Single handle
        const ax = AXES.find(a => a.id === dragging);
        const [mx,my] = svgCoords(e);
        state.axes[dragging] = projectToAxis(ax, mx, my);
        updateStarburst(); applyAndSync();
        showAxisTip(ax, state.axes[dragging]);

      } else if (freeOrigin) {
        // Freeform: for each axis, project the drag delta onto that axis direction
        // and add it as a percentage of SVG_R
        const [mx,my] = svgCoords(e);
        const dx = mx - freeOrigin.mx;
        const dy = my - freeOrigin.my;
        AXES.forEach(ax => {
          const a    = rad(ax.deg);
          const proj = dot(dx, dy, Math.cos(a), Math.sin(a));
          const delta = proj / SVG_R * 100;
          state.axes[ax.id] = clamp(Math.round(freeOrigin.snapshot[ax.id] + delta), 0, 100);
        });
        updateStarburst(); applyAndSync();
        // Show aggregate tip
        axisTip.textContent = 'Moving shape…';
        axisTip.classList.add('visible');
      }
    });

    // ── Pointerup ────────────────────────────────────────────────────────────
    svg.addEventListener('pointerup', () => {
      if (dragging) {
        pushHistory(state); dragging = null;
        clearTimeout(axisTip._t);
        axisTip._t = setTimeout(() => axisTip.classList.remove('visible'), 600);
      }
      if (freeOrigin) {
        pushHistory(state); freeOrigin = null;
        svg.style.cursor = '';
        clearTimeout(axisTip._t);
        axisTip._t = setTimeout(() => axisTip.classList.remove('visible'), 600);
      }
    });
    svg.addEventListener('pointercancel', () => { dragging = null; freeOrigin = null; svg.style.cursor = ''; });

    // ── Keyboard on handles ──────────────────────────────────────────────────
    svg.querySelectorAll('.tc-handle').forEach(h => {
      h.addEventListener('keydown', e => {
        const id = h.dataset.axis, delta = e.shiftKey ? 10 : 1;
        if      (e.key==='ArrowUp'  || e.key==='ArrowRight') state.axes[id] = clamp(state.axes[id]+delta, 0, 100);
        else if (e.key==='ArrowDown'|| e.key==='ArrowLeft')  state.axes[id] = clamp(state.axes[id]-delta, 0, 100);
        else if (e.key==='Home') state.axes[id] = 0;
        else if (e.key==='End')  state.axes[id] = 100;
        else return;
        updateStarburst(); applyAndSync(); pushHistory(state);
      });
    });
  }

  // ─── Accordion ─────────────────────────────────────────────────────────────
  const accDiv = root.querySelector('#tc-accordion');
  const ACC_SECTIONS = [
    { id:'type',     label:'Typography' },
    { id:'color',    label:'Color & Harmony' },
    { id:'surfaces', label:'Surfaces & Glass' },
    { id:'layout',   label:'Layout' },
    { id:'vibe',     label:'Vibe' },
  ];
  const accOpen = new Set(['type','color']); // open by default
  const accBuilt = new Set();

  function updateSliderDisplay(sl, input, valEl) {
    const v = state.sliders[sl.id];
    const pct = ((v - sl.min) / (sl.max - sl.min) * 100).toFixed(1);
    input.style.setProperty('--pct', pct + '%');
    if      (sl.id === 'hue')         { input.style.setProperty('--hue-h', v); valEl.textContent = v + '°'; }
    else if (sl.id === 'scale')        valEl.textContent = v + '%';
    else if (sl.id === 'colors')       valEl.textContent = v;
    else if (sl.id === 'accHueSplit')  valEl.textContent = v + '°';
    else if (sl.id === 'bgHue')        valEl.textContent = (v >= 0 ? '+' : '') + v + '°';
    else                               valEl.textContent = Math.round(pct) + '%';
  }

  function makeSliderRow(sl) {
    const isLocked = !isFeatureUnlocked('vibe_' + sl.id);
    const row = document.createElement('div'); row.className = 'tc-slider-row' + (isLocked ? ' control--locked' : '');
    const label = document.createElement('div'); label.className = 'tc-slider-label'; label.textContent = sl.label;
    if (isLocked) {
      const pill = document.createElement('span'); pill.className = 'pro-pill'; pill.textContent = 'Pro';
      row.appendChild(pill);
    }
    label.title = 'Dbl-click to reset · hover + ← → to nudge';
    label.addEventListener('dblclick', () => { state.sliders[sl.id] = sl.def; updateAccSliders(); applyAndSync(); pushHistory(state); });
    const wrap = document.createElement('div'); wrap.className = 'tc-range-wrap';
    if (sl.lo || sl.hi) { const ends = document.createElement('div'); ends.className = 'tc-slider-ends'; ends.innerHTML = `<span>${sl.lo}</span><span>${sl.hi}</span>`; wrap.appendChild(ends); }
    const input = document.createElement('input'); input.type = 'range'; input.min = sl.min; input.max = sl.max; input.step = 1;
    input.className = 'tc-range' + (sl.id === 'hue' ? ' hue-range' : ''); input.dataset.sid = sl.id;
    wrap.appendChild(input);
    const val = document.createElement('div'); val.className = 'tc-slider-val'; val.dataset.sid = sl.id;
    row.appendChild(label); row.appendChild(wrap); row.appendChild(val);
    input.value = state.sliders[sl.id]; updateSliderDisplay(sl, input, val);
    input.addEventListener('input', () => { state.sliders[sl.id] = Number(input.value); updateSliderDisplay(sl, input, val); applyAndSync(); });
    input.addEventListener('change', () => pushHistory(state));
    return row;
  }

  function addSubLabel(container, text) {
    const d = document.createElement('div'); d.className = 'tc-sub-lbl'; d.textContent = text;
    container.appendChild(d);
  }

  function addSliders(container, ids) {
    ids.forEach(id => { const sl = SLIDERS.find(s => s.id === id); if (sl) container.appendChild(makeSliderRow(sl)); });
  }

  // ── Type section ────────────────────────────────────────────────────────────
  function buildTypeSection(c) {
    const picks = document.createElement('div'); picks.className = 'tc-font-picks';
    FONT_PRESETS.forEach((fp, i) => {
      const btn = document.createElement('button'); btn.className = 'tc-font-pill'; btn.textContent = fp.label;
      if (fp.family) btn.style.fontFamily = fp.family;
      if ((state.sliders.fontPreset ?? 0) === i) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.sliders.fontPreset = i;
        picks.querySelectorAll('.tc-font-pill').forEach(b => b.classList.remove('active')); btn.classList.add('active');
        customRow.classList.toggle('visible', i === FONT_PRESETS.length - 1);
        applyAndSync(); pushHistory(state);
      });
      picks.appendChild(btn);
    });
    c.appendChild(picks);
    const customRow = document.createElement('div'); customRow.id = 'tc-custom-font-row';
    if ((state.sliders.fontPreset ?? 0) === FONT_PRESETS.length - 1) customRow.classList.add('visible');
    const customIn = document.createElement('input'); customIn.type = 'text'; customIn.id = 'tc-custom-font';
    customIn.placeholder = 'e.g. "Inter", sans-serif'; customIn.value = state.customFont || '';
    customIn.addEventListener('input', () => { state.customFont = customIn.value; applyAndSync(); });
    customRow.appendChild(customIn); c.appendChild(customRow);
    addSubLabel(c, 'Scale & Spacing'); addSliders(c, ['scale','weight','leading','tracking']);
    addSubLabel(c, 'Headings');       addSliders(c, ['hRatio','h2Ratio']);
    addSubLabel(c, 'Opacity');        addSliders(c, ['txOpacity','muOpacity']);
  }

  // ── Color section ───────────────────────────────────────────────────────────
  const COLOR_TOKENS = [
    { key:'--bg',        label:'Background', get: t => t.bg },
    { key:'--surface',   label:'Surface',    get: t => t.surface },
    { key:'--surface-2', label:'Surface 2',  get: t => t.surf2 },
    { key:'--deep',      label:'Deep',       get: t => t.deep },
    { key:'--hi',        label:'Heading',    get: t => t.hi },
    { key:'--text',      label:'Body text',  get: t => t.text },
    { key:'--muted',     label:'Muted',      get: t => t.muted },
    { key:'--accent',    label:'Accent',     get: t => t.accent },
    { key:'--acc-bg',    label:'Accent BG',  get: t => t.accBg },
    { key:'--acc-hi',    label:'Accent Hi',  get: t => t.accHi },
    { key:'--accent-2',  label:'Accent 2',   get: t => t.split2 },
  ];

  function buildColorSection(c) {
    // Harmony wheel
    const hwWrap = document.createElement('div'); hwWrap.className = 'tc-hw-wrap';
    const ring = document.createElement('div'); ring.className = 'tc-hw-ring'; ring.id = 'tc-hw-ring';
    const hole = document.createElement('div'); hole.className = 'tc-hw-hole'; ring.appendChild(hole);
    ['tc-hw-bg','tc-hw-acc','tc-hw-spl'].forEach(id => {
      const dot = document.createElement('div'); dot.className = 'tc-hw-dot'; dot.id = id; ring.appendChild(dot);
    });
    const legend = document.createElement('div'); legend.className = 'tc-hw-legend';
    [['BG','tc-hw-bg'],['Accent','tc-hw-acc'],['Split','tc-hw-spl']].forEach(([name, id]) => {
      const item = document.createElement('div'); item.className = 'tc-hw-legend-item';
      const ldot = document.createElement('div'); ldot.className = 'tc-hw-legend-dot'; ldot.id = id + '-l';
      const lbl  = document.createElement('span'); lbl.className = 'tc-hw-legend-lbl'; lbl.textContent = name;
      const hex  = document.createElement('span'); hex.className = 'tc-hw-legend-hex'; hex.id = id + '-h';
      item.appendChild(ldot); item.appendChild(lbl); item.appendChild(hex); legend.appendChild(item);
    });
    hwWrap.appendChild(ring); hwWrap.appendChild(legend); c.appendChild(hwWrap);

    addSliders(c, ['hue','accSat','accHueSplit','popAccent']);
    addSubLabel(c, 'Individual Color Overrides — lock to pin, chip/hex to edit');
    const tokenContainer = document.createElement('div'); tokenContainer.id = 'tc-color-tokens';
    COLOR_TOKENS.forEach(tk => tokenContainer.appendChild(makeTokenRow(tk)));
    c.appendChild(tokenContainer);
    updateHarmonyWheel();
  }

  function makeTokenRow(tk) {
    const t = computeTheme(state);
    const computed = tk.get(t);
    const ov = (state.colorOverrides || {})[tk.key];
    const hexVal = hslToHex(ov || computed);

    const row = document.createElement('div'); row.className = 'tc-color-token'; row.dataset.tkKey = tk.key;
    const chip = document.createElement('input'); chip.type = 'color'; chip.className = 'tc-token-chip';
    chip.value = hexVal; chip.title = tk.key;
    const name = document.createElement('div'); name.className = 'tc-token-name'; name.textContent = tk.label;
    const hexInp = document.createElement('input'); hexInp.type = 'text'; hexInp.className = 'tc-token-hex' + (ov ? ' ov' : '');
    hexInp.value = hexVal; hexInp.placeholder = '#rrggbb';
    const lockBtn = document.createElement('button'); lockBtn.className = 'tc-token-lock' + (ov ? ' locked' : '');
    lockBtn.textContent = ov ? '🔒' : '○'; lockBtn.title = ov ? 'Unlock (restore computed)' : 'Lock this color';

    function pin(hex) {
      if (!state.colorOverrides) state.colorOverrides = {};
      state.colorOverrides[tk.key] = hex;
      hexInp.classList.add('ov'); lockBtn.classList.add('locked'); lockBtn.textContent = '🔒';
      chip.value = hex.startsWith('#') ? hex : '#' + hex; applyAndSync();
    }
    function unpin() {
      if (state.colorOverrides) delete state.colorOverrides[tk.key];
      hexInp.classList.remove('ov'); lockBtn.classList.remove('locked'); lockBtn.textContent = '○';
      const newHex = hslToHex(tk.get(computeTheme(state)));
      hexInp.value = newHex; chip.value = newHex; applyAndSync();
    }
    chip.addEventListener('input', () => { hexInp.value = chip.value; pin(chip.value); });
    hexInp.addEventListener('change', () => {
      let v = hexInp.value.trim();
      if (/^#?[0-9a-fA-F]{3,6}$/.test(v)) { if (!v.startsWith('#')) v = '#'+v; chip.value = v; pin(v); }
    });
    lockBtn.addEventListener('click', () => lockBtn.classList.contains('locked') ? unpin() : pin(hexInp.value || '#000000'));

    row.appendChild(chip); row.appendChild(name); row.appendChild(hexInp); row.appendChild(lockBtn);
    return row;
  }

  function updateHarmonyWheel() {
    const ring = root.querySelector('#tc-hw-ring'); if (!ring) return;
    const t = computeTheme(state);
    const R = 27, CX = 36, CY = 36;
    function hueOf(hslStr) { const m = hslStr.match(/hsla?\((\d+)/); return m ? parseInt(m[1]) : 0; }
    [['tc-hw-bg', t.bg], ['tc-hw-acc', t.accent], ['tc-hw-spl', t.split2]].forEach(([id, color]) => {
      const dot = ring.querySelector('#' + id); if (!dot) return;
      const a = hueOf(color) * Math.PI / 180 - Math.PI / 2;
      dot.style.left = (CX + R * Math.cos(a)) + 'px';
      dot.style.top  = (CY + R * Math.sin(a)) + 'px';
      dot.style.background = color;
      const ldot = root.querySelector('#' + id + '-l'); if (ldot) ldot.style.background = color;
      const lhex = root.querySelector('#' + id + '-h'); if (lhex) lhex.textContent = hslToHex(color);
    });
    // Update the hole to match panel surface
    const hole = ring.querySelector('.tc-hw-hole'); if (hole) hole.style.background = 'var(--surface-2,#1a2035)';
  }

  function updateColorTokens() {
    const t = computeTheme(state);
    root.querySelectorAll('.tc-color-token').forEach(row => {
      const tk = COLOR_TOKENS.find(tk => tk.key === row.dataset.tkKey); if (!tk) return;
      const ov = (state.colorOverrides || {})[tk.key];
      if (!ov) { // only update un-locked tokens
        const hex = hslToHex(tk.get(t));
        const chip = row.querySelector('.tc-token-chip'); if (chip) chip.value = hex;
        const hexInp = row.querySelector('.tc-token-hex'); if (hexInp && document.activeElement !== hexInp) hexInp.value = hex;
      }
    });
  }

  // ── Surfaces section ────────────────────────────────────────────────────────
  function buildSurfacesSection(c) {
    addSubLabel(c, 'Transparency & Glass');
    addSliders(c, ['surfaceAlpha','glassBlur']);
    addSubLabel(c, 'Tint & Depth');
    addSliders(c, ['tint','sfSep','sfSat','bgSat','bgHue']);
  }

  // ── Layout section ──────────────────────────────────────────────────────────
  function buildLayoutSection(c) {
    addSliders(c, ['radius','border','density','shadow','motion','iconScale']);
  }

  // ── Vibe section ────────────────────────────────────────────────────────────
  function buildVibeSection(c) {
    addSliders(c, ['organic','polish','energy']);
  }

  const ACC_BUILDERS = { type:buildTypeSection, color:buildColorSection, surfaces:buildSurfacesSection, layout:buildLayoutSection, vibe:buildVibeSection };

  function buildAccordion() {
    accDiv.innerHTML = ''; accBuilt.clear();
    ACC_SECTIONS.forEach(sec => {
      const hd = document.createElement('div'); hd.className = 'tc-acc-hd' + (accOpen.has(sec.id) ? ' open' : '');
      hd.innerHTML = `<span>${sec.label}</span><span class="tc-acc-arrow">▶</span>`;
      const body = document.createElement('div'); body.className = 'tc-acc-body'; body.id = 'tc-acc-' + sec.id;
      if (accOpen.has(sec.id)) { ACC_BUILDERS[sec.id](body); accBuilt.add(sec.id); body.style.display = 'block'; }
      hd.addEventListener('click', () => {
        const wasOpen = accOpen.has(sec.id);
        accOpen[wasOpen ? 'delete' : 'add'](sec.id);
        hd.classList.toggle('open', !wasOpen);
        body.style.display = wasOpen ? 'none' : 'block';
        if (!wasOpen && !accBuilt.has(sec.id)) { ACC_BUILDERS[sec.id](body); accBuilt.add(sec.id); }
        if (!wasOpen && sec.id === 'color') updateHarmonyWheel();
      });
      accDiv.appendChild(hd); accDiv.appendChild(body);
    });
  }

  function updateAccSliders() {
    root.querySelectorAll('input.tc-range[data-sid]').forEach(input => {
      const sl = SLIDERS.find(s => s.id === input.dataset.sid); if (!sl) return;
      const valEl = input.closest('.tc-slider-row')?.querySelector('.tc-slider-val');
      input.value = state.sliders[sl.id]; if (valEl) updateSliderDisplay(sl, input, valEl);
    });
    // Update font picker active state
    root.querySelectorAll('.tc-font-pill').forEach((btn, i) => btn.classList.toggle('active', (state.sliders.fontPreset ?? 0) === i));
    // Update color tokens and harmony wheel
    updateColorTokens(); updateHarmonyWheel();
  }

  // ─── Presets ───────────────────────────────────────────────────────────────
  const presetsDiv=root.querySelector('#tc-presets');

  function buildPresets() {
    presetsDiv.innerHTML='';
    const all={...BUILTIN_PRESETS,...userPresets};
    Object.entries(all).forEach(([name,preset])=>{
      const isUser=!!userPresets[name];
      const pill=document.createElement('button');
      pill.className='tc-preset-pill'+(isUser?' user':''); pill.dataset.name=name;
      pill.innerHTML=name+(isUser?`<span class="tc-del" data-del="${name}">×</span>`:'');
      pill.addEventListener('click',e=>{
        if (e.target.dataset.del) { delete userPresets[e.target.dataset.del]; saveUserPresets(); buildPresets(); return; }
        state=ensureDefaults(deepClone(all[name])); pushHistory(state); applyAndSync();
      });
      presetsDiv.appendChild(pill);
    });
    updatePresetHighlight();
  }

  function updatePresetHighlight() {
    const all={...BUILTIN_PRESETS,...userPresets}; let anyMatch=false;
    presetsDiv.querySelectorAll('.tc-preset-pill').forEach(p=>{
      const m=all[p.dataset.name]&&deepEq(all[p.dataset.name],state);
      p.classList.toggle('active',m); if (m) anyMatch=true;
    });
    root.querySelector('#tc-unsaved').classList.toggle('visible',!anyMatch);
  }

  // ─── History ───────────────────────────────────────────────────────────────
  const histBar=root.querySelector('#tc-hist-bar');
  const histScroll=root.querySelector('#tc-hist-scroll');

  function updateHistBar() {
    histBar.innerHTML='';
    history.forEach((snap,i)=>{
      const dot=document.createElement('div');
      dot.className='tc-hist-dot'+(i===histIdx?' cur':'');

      // Tooltip
      const tip=document.createElement('div'); tip.className='tc-hist-tip';
      const label=histLabel(snap);
      const swatchRow=document.createElement('div'); swatchRow.className='tc-hist-swatch';
      swatchRow.innerHTML=miniSwatchHTML(snap); tip.appendChild(swatchRow);
      if (label) { const nm=document.createElement('div'); nm.className='tc-hist-name'; nm.textContent=label; tip.appendChild(nm); }
      const axGrid=document.createElement('div'); axGrid.className='tc-hist-axes';
      AXES.forEach(ax=>{ const r=document.createElement('div'); r.className='tc-hist-ax'; r.innerHTML=`${ax.label}<span>${snap.axes[ax.id]}</span>`; axGrid.appendChild(r); });
      tip.appendChild(axGrid);
      const stepEl=document.createElement('div'); stepEl.className='tc-hist-step'; stepEl.textContent=i===histIdx?'current':`step ${i+1} of ${history.length}`; tip.appendChild(stepEl);
      dot.appendChild(tip);

      dot.addEventListener('click',()=>{ histIdx=i; state=deepClone(history[i]); applyAndSync(false); });
      dot.addEventListener('contextmenu',e=>{ e.preventDefault(); state=deepClone(history[i]); pushHistory(state); applyAndSync(false); });
      histBar.appendChild(dot);
    });
    // Scroll current dot into view
    requestAnimationFrame(()=>{
      const cur=histBar.querySelector('.cur');
      if (cur) cur.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
    });
  }

  // ─── Swatch ────────────────────────────────────────────────────────────────
  const swatchDiv=root.querySelector('#tc-swatch');
  function updateSwatch() {
    const t=computeTheme(state);
    const cols=[t.bg,t.surface,t.surf2,t.text,t.muted,t.accent,t.accBg,t.accHi];
    swatchDiv.innerHTML=cols.map(c=>`<span style="background:${c}"></span>`).join('');
  }

  // ─── syncUI ────────────────────────────────────────────────────────────────
  function syncUI() { updateStarburst(); updateAccSliders(); updatePresetHighlight(); updateHistBar(); updateSwatch(); }

  // ─── Dock / drag ──────────────────────────────────────────────────────────
  let dockMode='float';
  function setDock(mode) {
    dockMode=mode; root.classList.remove('dock-right','dock-bottom');
    if (mode==='right')  root.classList.add('dock-right');
    if (mode==='bottom') root.classList.add('dock-bottom');
    if (mode==='float')  { root.style.bottom='76px'; root.style.right='22px'; root.style.top=''; root.style.left=''; }
    root.querySelector('#tc-dock-float').classList.toggle('active',  mode==='float');
    root.querySelector('#tc-dock-right').classList.toggle('active',  mode==='right');
    root.querySelector('#tc-dock-bottom').classList.toggle('active', mode==='bottom');
  }
  const header=root.querySelector('#tc-header');
  let dp=false,dox=0,doy=0;
  header.addEventListener('pointerdown',e=>{ if (dockMode!=='float'||e.target.tagName==='BUTTON') return; dp=true; header.setPointerCapture(e.pointerId); const r=root.getBoundingClientRect(); dox=e.clientX-r.left; doy=e.clientY-r.top; root.style.bottom='auto'; root.style.right='auto'; });
  document.addEventListener('pointermove',e=>{ if (!dp) return; root.style.left=(e.clientX-dox)+'px'; root.style.top=(e.clientY-doy)+'px'; });
  document.addEventListener('pointerup',()=>{ dp=false; });

  // ─── Events ────────────────────────────────────────────────────────────────
  fab.addEventListener('click',()=>{ const v=root.classList.toggle('visible'); fab.classList.toggle('open',v); });
  root.querySelector('#tc-close').addEventListener('click',    ()=>{ root.classList.remove('visible'); fab.classList.remove('open'); });
  root.querySelector('#tc-undo').addEventListener('click',     undo);
  root.querySelector('#tc-redo').addEventListener('click',     redo);
  root.querySelector('#tc-dock-float').addEventListener('click', ()=>setDock('float'));
  root.querySelector('#tc-dock-right').addEventListener('click', ()=>setDock('right'));
  root.querySelector('#tc-dock-bottom').addEventListener('click',()=>setDock('bottom'));
  root.querySelector('#tc-ldtoggle').addEventListener('click', ()=>{ state.axes.light=state.axes.light<50?92:5; pushHistory(state); applyAndSync(); });
  root.querySelector('#tc-panel-mode').addEventListener('click', ()=>{ root.classList.toggle('tc-panel-light'); });
  root.querySelector('#tc-help').addEventListener('click', ()=>{ root.querySelector('#tc-help-overlay').style.display='flex'; });
  root.querySelector('#tc-help-close').addEventListener('click', ()=>{ root.querySelector('#tc-help-overlay').style.display='none'; });
  root.querySelector('#tc-reset').addEventListener('click',    ()=>{ state=deepClone(DEFAULTS); pushHistory(state); applyAndSync(); });
  root.querySelector('#tc-save-preset').addEventListener('click',()=>{ if(!isFeatureUnlocked('save_preset')) return; const n=prompt('Preset name:','My Preset'); if (!n?.trim()) return; userPresets[n.trim()]=deepClone(state); saveUserPresets(); buildPresets(); });
  root.querySelector('#tc-export').addEventListener('click', () => {
    if(!isFeatureUnlocked('export_css')) return;
    const t = computeTheme(state);
    const date = new Date().toISOString().slice(0,10);
    const css = `/* OpenClaw theme — ${date} */\n:root {\n  --bg:${t.bg}; --surface:${t.surface}; --surface-2:${t.surf2}; --deep:${t.deep};\n  --border:${t.border}; --border-2:${t.border2};\n  --hi:${t.hi}; --text:${t.text}; --text-2:${t.text2};\n  --muted:${t.muted}; --dim:${t.dim}; --ghost:${t.ghost};\n  --accent:${t.accent}; --acc-bg:${t.accBg}; --acc-hi:${t.accHi}; --accent-2:${t.split2};\n  --r-sm:${t.rSmV.toFixed(1)}px; --r:${t.rMdV.toFixed(1)}px;\n  --r-lg:${t.rLgV.toFixed(1)}px; --pill:${t.pillV.toFixed(1)}px;\n  --border-w:${t.borderW.toFixed(2)}px;\n  --sp-xs:${t.spXs}; --sp-sm:${t.spSm}; --sp-md:${t.spMd}; --sp-lg:${t.spLg};\n  --shadow:${t.shadow}; --shadow-hover:${t.shadowHover};\n  --transition:${t.transition}; --line-height:${t.lineHeight};\n  --h1-size:${t.h1Em}em; --h2-size:${t.h2Em}em; --h3-size:${t.h3Em}em;\n  --icon-scale:${t.iconEm}em;\n  font-family:${t.fontFamily};\n  font-size:${t.fontSizePx}; font-weight:${t.fontWeight};\n  letter-spacing:${t.letterSpacing}; line-height:${t.lineHeight};\n}`;
    const b = new Blob([css], {type:'text/css'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'theme-'+date+'.css'; a.click();
  });
  root.querySelector('#tc-import-file').addEventListener('change',e=>{ if(!isFeatureUnlocked('import_theme')) return; const f=e.target.files[0]; if (!f) return; const r=new FileReader(); r.onload=ev=>{ try { const d=JSON.parse(ev.target.result); if (d.state?.axes){state=ensureDefaults(d.state);pushHistory(state);applyAndSync();} if (d.userPresets){Object.assign(userPresets,d.userPresets);saveUserPresets();buildPresets();} } catch{alert('Invalid theme file.');} }; r.readAsText(f); e.target.value=''; });
  root.querySelector('#tc-apply-all').addEventListener('click', ()=>{ saveState(); if (bc) bc.postMessage({type:'theme',state:deepClone(state)}); const btn=root.querySelector('#tc-apply-all'); btn.textContent='Sent ✓'; setTimeout(()=>{btn.textContent='Apply All';},1200); });

  // Arrow-key nudge on hovered slider
  let _hoveredSl = null;
  root.addEventListener('mouseover', e => {
    const inp = e.target.closest('input.tc-range');
    _hoveredSl = inp ? inp.dataset.sid : null;
  });
  root.addEventListener('mouseout', e => {
    if (e.target.closest('input.tc-range')) _hoveredSl = null;
  });

  document.addEventListener('keydown', e => {
    // Help overlay Esc
    const helpOverlay = root.querySelector('#tc-help-overlay');
    if (e.key === 'Escape' && helpOverlay?.style.display !== 'none') {
      helpOverlay.style.display = 'none'; return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Arrow keys on hovered slider
    if (_hoveredSl && (e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='ArrowUp'||e.key==='ArrowDown')) {
      const sl = SLIDERS.find(s => s.id === _hoveredSl); if (sl) {
        const delta = (e.shiftKey ? 10 : 1) * (e.key==='ArrowRight'||e.key==='ArrowUp' ? 1 : -1);
        state.sliders[_hoveredSl] = clamp(state.sliders[_hoveredSl] + delta, sl.min, sl.max);
        e.preventDefault(); updateAccSliders(); applyAndSync(); pushHistory(state);
      }
      return;
    }

    if ((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();}
    if ((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redo();}
    if (e.key==='Escape'&&root.classList.contains('visible')){root.classList.remove('visible');fab.classList.remove('open');}
    if (e.key==='?' || (e.key==='/' && e.shiftKey)) { root.querySelector('#tc-help-overlay').style.display='flex'; }
  });

  // ─── Public API (for inspector and external integrations) ─────────────────
  window.__tcSet = function(id, val) {
    if (id in state.axes) { state.axes[id] = Number(val); }
    else { state.sliders[id] = Number(val); }
    applyAndSync(); syncUI();
  };
  window.__tcGet = function(id) {
    if (id in state.axes) return state.axes[id];
    return state.sliders[id] ?? null;
  };

  // ─── Init ──────────────────────────────────────────────────────────────────
  buildStarburst(); buildAccordion(); buildPresets(); updateHistBar(); updateSwatch(); setDock('float');
  
  // 3-tier gating UI
  if (!isFeatureUnlocked('export_css')) {
    const btn = root.querySelector('#tc-export');
    btn.classList.add('control--locked'); btn.style.position = 'relative';
    btn.innerHTML += '<span class="pro-pill" style="top:-8px;right:-8px;">Pro</span>';
  }
  if (!isFeatureUnlocked('save_preset')) {
    const btn = root.querySelector('#tc-save-preset');
    btn.classList.add('control--locked'); btn.style.position = 'relative';
    btn.innerHTML += '<span class="pro-pill" style="top:-8px;right:-8px;">Pro</span>';
  }
  if (!isFeatureUnlocked('import_theme')) {
    const lbl = root.querySelector('#tc-import-file').parentElement;
    lbl.classList.add('control--locked'); lbl.style.position = 'relative';
    lbl.insertAdjacentHTML('beforeend', '<span class="pro-pill" style="top:-8px;right:-8px;">Pro</span>');
  }
  if (getMode() === 'demo') {
    const banner = document.createElement('div');
    banner.id = 'tb-promo-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;background:var(--accent,#2563eb);color:white;text-align:center;padding:10px;font-size:12px;z-index:999999;';
    banner.innerHTML = 'You\'re using Theme Builder Free — <a href="?mode=pro" style="color:inherit;font-weight:700;">[Unlock Pro →]</a>';
    document.body.appendChild(banner);
  }

  if (history.length===1&&deepEq(history[0],DEFAULTS)&&!deepEq(state,DEFAULTS)) pushHistory(state);
})();
