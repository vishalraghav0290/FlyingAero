import { IconLayer, TextLayer } from '@deck.gl/layers';
/**
 * Radio navigation aids from OurAirports (public domain): VOR, VOR-DME, VORTAC, TACAN,
 * DME, NDB, NDB-DME. Drawn with the usual chart symbols:
 *  VOR = hexagon + dot, VOR-DME = hexagon in a box, VORTAC / TACAN = hexagon with three
 *  lobes, DME = box, NDB = dotted rings. VHF aids blue, NDBs magenta (as on charts).
 * Not authoritative: OurAirports data is crowd-maintained. Not for navigation.
 */
import { theme } from './mapstyles.js';

const S = 64;
const TYPES = ['VOR', 'VOR-DME', 'VORTAC', 'TACAN', 'DME', 'NDB', 'NDB-DME'];
const VHF_ZOOM = 6; // Google zoom where VOR/DME/TACAN appear
const NDB_ZOOM = 8;
const LABEL_ZOOM = 8.5;
const COLORS = {
  dark: { vhf: '#64bef1', ndb: '#e07ae0', halo: 'rgba(0,0,0,0.75)' },
  light: { vhf: '#1f5fa8', ndb: '#8a2b8a', halo: 'rgba(255,255,255,0.9)' },
};

function hexagon(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  ctx.closePath();
}

function drawSymbol(ctx, type, color, halo) {
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.lineJoin = 'round';
  const stroke = (w) => {
    ctx.strokeStyle = halo;
    ctx.lineWidth = w + 4;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  const dot = (r) => {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  if (type.startsWith('NDB')) {
    for (const [r, n] of [[9, 10], [15, 16], [21, 22]]) {
      for (let i = 0; i < n; i++) {
        const a = ((Math.PI * 2) / n) * i;
        ctx.beginPath();
        ctx.arc(r * Math.cos(a), r * Math.sin(a), 1.9, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * Math.cos(a), r * Math.sin(a), 1.4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    dot(4);
    if (type === 'NDB-DME') {
      ctx.beginPath();
      ctx.rect(-26, -26, 52, 52);
      stroke(2.5);
    }
  } else if (type === 'DME') {
    ctx.beginPath();
    ctx.rect(-16, -16, 32, 32);
    stroke(3);
    dot(3.5);
  } else {
    hexagon(ctx, 16);
    stroke(3);
    dot(3.5);
    if (type === 'VOR-DME') {
      ctx.beginPath();
      ctx.rect(-20, -18, 40, 36);
      stroke(2.5);
    }
    if (type === 'VORTAC' || type === 'TACAN') {
      // three filled lobes on alternate hexagon sides
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 * i) / 3 + Math.PI / 6 + Math.PI / 2);
        ctx.beginPath();
        ctx.rect(-8, 13.5, 16, 9);
        ctx.fillStyle = color;
        ctx.strokeStyle = halo;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = S * TYPES.length;
  canvas.height = S * 2;
  const ctx = canvas.getContext('2d');
  const mapping = {};
  ['dark', 'light'].forEach((mode, row) => {
    const c = COLORS[mode];
    TYPES.forEach((t, i) => {
      ctx.save();
      ctx.translate(i * S, row * S);
      drawSymbol(ctx, t, t.startsWith('NDB') ? c.ndb : c.vhf, c.halo);
      ctx.restore();
      mapping[`${t}:${mode}`] = { x: i * S, y: row * S, width: S, height: S, mask: false };
    });
  });
  return { url: canvas.toDataURL('image/png'), mapping };
}

export function formatFrequency(n) {
  if (!n.freqKhz) return '';
  return n.type.startsWith('NDB') ? `${n.freqKhz} kHz` : `${(n.freqKhz / 1000).toFixed(2)} MHz`;
}

export class NavaidLayer {
  constructor({ onHover } = {}) {
    this.rows = [];
    this.onHover = onHover;
    this.loading = null;
    this.atlas = null;
  }

  /** Loaded lazily the first time navaids are switched on (~0.9 MB, gzipped ~250 KB). */
  ensureLoaded(onLoaded) {
    this.loading ??= fetch('/api/navaids')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        this.atlas = buildAtlas();
        this.rows = rows
          .filter((r) => TYPES.includes(r[2]))
          .map((r) => ({
            ident: r[0], name: r[1], type: r[2], freqKhz: r[3], latitude: r[4], longitude: r[5],
            elevationFt: r[6], country: r[7], dmeChannel: r[8], usage: r[9], power: r[10], airport: r[11],
          }));
        onLoaded?.();
      })
      .catch((err) => console.warn('Navaids unavailable:', err.message));
  }

  layers(googleZoom, visible) {
    if (!visible) return [];
    if (!this.rows.length) return [];
    const z = googleZoom;
    if (z < VHF_ZOOM) return [];
    const mode = theme.current.light ? 'light' : 'dark';
    const data = this.rows.filter((n) => (n.type.startsWith('NDB') ? z >= NDB_ZOOM : true));
    const size = z < 8 ? 14 : z < 10 ? 18 : 22;
    const labelled = z >= LABEL_ZOOM ? data : [];
    const c = COLORS[mode];
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const key = `${mode}:${Math.round(z * 2)}`;
    return [
      new IconLayer({
        id: 'navaids',
        data,
        iconAtlas: this.atlas.url,
        iconMapping: this.atlas.mapping,
        getIcon: (n) => `${n.type}:${mode}`,
        getPosition: (n) => [n.longitude, n.latitude],
        getSize: size,
        sizeUnits: 'pixels',
        pickable: true,
        parameters: { depthCompare: 'always' },
        onHover: ({ object }) => this.onHover?.(object ?? null),
        updateTriggers: { getIcon: key },
      }),
      new TextLayer({
        id: 'navaid-labels',
        data: labelled,
        getPosition: (n) => [n.longitude, n.latitude],
        getText: (n) => `${n.ident} ${formatFrequency(n).replace(/ (MHz|kHz)/, '')}`,
        getColor: (n) => [...rgb(n.type.startsWith('NDB') ? c.ndb : c.vhf), 255],
        getSize: 10,
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        getPixelOffset: [size / 2 + 3, 0],
        fontFamily: '"Open Sans", sans-serif',
        fontWeight: 600,
        fontSettings: { sdf: true },
        outlineWidth: 3,
        outlineColor: mode === 'light' ? [255, 255, 255, 230] : [0, 0, 0, 200],
        parameters: { depthCompare: 'always' },
        updateTriggers: { getColor: key, getPixelOffset: size },
      }),
    ];
  }
}
