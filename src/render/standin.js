// Procedural silhouette in a procedural room, so the domains can be shown
// without a camera. Labelled as a stand-in wherever it appears, and it never
// feeds the recogniser.

import { SIGN_SCENES, NEUTRAL_SCENES, scenePoints } from '../handmodel/poses.js';
import { projectHand, HAND_CONNECTIONS } from '../handmodel/synthetic.js';
import { TAU, FONTS } from './draw.js';

const VIRTUAL = { width: 640, height: 480 };

// Figure is drawn for a 720x1280 stage and scaled into whatever the stage
// really is, so a wide stage shows someone standing back, not a head filling
// the frame.
const DESIGN = { width: 720, height: 1280 };

export class StandIn {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.k = H / DESIGN.height;
    this.ox = (W - DESIGN.width * this.k) / 2;
  }

  /** A tracker-shaped frame for the stand-in's hands (virtual 640x480 camera). */
  frameFor(domainId, timeSec) {
    const scene = domainId && SIGN_SCENES[domainId] ? SIGN_SCENES[domainId].friendly : NEUTRAL_SCENES.relaxedBoth;
    const breathe = Math.sin(timeSec * 1.4);
    // smaller and lower than a real close-up, to keep the face and the domain
    // behind it readable
    const hands = scenePoints(scene, { roll: breathe * 0.6, scale: 0.8 }).map(({ chirality, pts }) => {
      const placed = pts.map(([x, y, z]) => [x * 0.9, y + 0.045 + breathe * 0.002, z]);
      return projectHand(placed, { chirality, width: VIRTUAL.width, height: VIRTUAL.height, score: 0.99 });
    });
    return { width: VIRTUAL.width, height: VIRTUAL.height, hands };
  }

  drawBackground(g) {
    const { W, H } = this;
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#5a524a');
    wall.addColorStop(0.65, '#3f3934');
    wall.addColorStop(1, '#2a2622');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    // a warm lamp pool, upper right
    const lamp = g.createRadialGradient(W * 0.86, H * 0.16, 0, W * 0.86, H * 0.16, W * 0.7);
    lamp.addColorStop(0, 'rgba(255,214,160,0.35)');
    lamp.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, W, H);
    // window with blinds, upper left
    g.fillStyle = '#7d8590';
    g.fillRect(W * 0.04, H * 0.06, W * 0.28, H * 0.21);
    g.strokeStyle = 'rgba(40,38,36,0.55)';
    g.lineWidth = 3;
    for (let i = 1; i < 9; i++) {
      g.beginPath();
      g.moveTo(W * 0.04, H * 0.06 + (H * 0.21 * i) / 9);
      g.lineTo(W * 0.32, H * 0.06 + (H * 0.21 * i) / 9);
      g.stroke();
    }
    // shelf with two boxes
    g.fillStyle = '#2f2a26';
    g.fillRect(W * 0.68, H * 0.24, W * 0.32, 10);
    g.fillStyle = '#6b5f53';
    g.fillRect(W * 0.74, H * 0.18, 34, H * 0.06);
    g.fillStyle = '#4f6a64';
    g.fillRect(W * 0.86, H * 0.16, 24, H * 0.08);
  }

  /** Silhouette body plus hands; `hands` are already in stage pixels. */
  drawFigure(g, hands, timeSec = 0) {
    const W = DESIGN.width;
    const H = DESIGN.height;
    const bob = Math.sin(timeSec * 1.4) * 2;
    // Stage pixels -> this figure's own 720x1280 space.
    const local = (p) => [(p[0] - this.ox) / this.k, p[1] / this.k];
    g.save();
    g.translate(this.ox, 0);
    g.scale(this.k, this.k);
    // torso
    const body = g.createLinearGradient(0, H * 0.6, 0, H);
    body.addColorStop(0, '#24262b');
    body.addColorStop(1, '#16171a');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-20, H + 10);
    g.bezierCurveTo(-10, H * 0.74, W * 0.18, H * 0.64 + bob, W * 0.5, H * 0.63 + bob);
    g.bezierCurveTo(W * 0.82, H * 0.64 + bob, W + 10, H * 0.74, W + 20, H + 10);
    g.closePath();
    g.fill();
    // neck + head
    g.fillStyle = '#1e2024';
    g.fillRect(W * 0.42, H * 0.44 + bob, W * 0.16, H * 0.22);
    const head = g.createRadialGradient(W * 0.46, H * 0.25 + bob, 20, W * 0.5, H * 0.3 + bob, 260);
    head.addColorStop(0, '#3a3c42');
    head.addColorStop(1, '#202227');
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.3 + bob, 172, 236, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(W * 0.5 - 62, H * 0.29 + bob, 18, 8, 0, 0, TAU);
    g.ellipse(W * 0.5 + 62, H * 0.29 + bob, 18, 8, 0, 0, TAU);
    g.fill();
    g.font = `600 26px ${FONTS.mono}`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(160,160,165,0.55)';
    g.fillText('STAND-IN', W * 0.5, H * 0.93);
    // forearms rising from below the frame to the wrists
    if (hands && hands.length) {
      g.strokeStyle = '#25272c';
      g.lineCap = 'round';
      g.lineWidth = 70;
      for (const h of hands) {
        const wrist = local(h.pts[0]);
        const elbowX = wrist[0] < W / 2 ? W * 0.18 : W * 0.82;
        g.beginPath();
        g.moveTo(elbowX, H + 40);
        g.quadraticCurveTo(elbowX + (wrist[0] - elbowX) * 0.3, H * 0.9, wrist[0], wrist[1] + 30);
        g.lineTo(wrist[0], wrist[1]);
        g.stroke();
      }
      for (const h of hands) this.drawHand(g, h.pts.map(local));
    }
    g.restore();
  }

  drawHand(g, pts) {
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // outline pass, then fill pass: reads as a solid hand with a clean edge
    for (const [stroke, extra] of [['#6a6e78', 4], ['#3b3e45', 0]]) {
      g.strokeStyle = stroke;
      g.fillStyle = stroke;
      g.beginPath();
      const palm = [0, 1, 5, 9, 13, 17].map((i) => pts[i]);
      g.moveTo(palm[0][0], palm[0][1]);
      for (let i = 1; i < palm.length; i++) g.lineTo(palm[i][0], palm[i][1]);
      g.closePath();
      g.fill();
      g.lineWidth = 18 + extra;
      g.stroke();
      g.lineWidth = 15 + extra;
      for (const [a, b] of HAND_CONNECTIONS) {
        g.beginPath();
        g.moveTo(pts[a][0], pts[a][1]);
        g.lineTo(pts[b][0], pts[b][1]);
        g.stroke();
      }
    }
    g.restore();
  }
}
