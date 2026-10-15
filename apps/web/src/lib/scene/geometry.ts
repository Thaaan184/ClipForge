import { BBox, LayerConfig, TransformConfig } from "../../types";

export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function identityMatrix(): AffineMatrix {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

export function multiplyMatrices(m1: AffineMatrix, m2: AffineMatrix): AffineMatrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
    ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty,
  };
}

export function invertMatrix(m: AffineMatrix): AffineMatrix | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-8) return null;
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    tx: (m.c * m.ty - m.d * m.tx) * invDet,
    ty: (m.b * m.tx - m.a * m.ty) * invDet,
  };
}

export function transformPoint(m: AffineMatrix, pt: [number, number]): [number, number] {
  return [
    m.a * pt[0] + m.c * pt[1] + m.tx,
    m.b * pt[0] + m.d * pt[1] + m.ty,
  ];
}

/**
 * Creates affine transformation matrix:
 * M = T(cx, cy) * R(theta) * S(w / bbox.w, h / bbox.h) * T(-bbox.cx, -bbox.cy)
 */
export function createLayerMatrix(transform: TransformConfig, bbox: BBox): AffineMatrix {
  const theta = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const sx = transform.w / Math.max(1, bbox.w);
  const sy = transform.h / Math.max(1, bbox.h);

  const bboxCx = bbox.x + bbox.w / 2;
  const bboxCy = bbox.y + bbox.h / 2;

  // S * T(-bboxCx, -bboxCy)
  const st: AffineMatrix = {
    a: sx,
    b: 0,
    c: 0,
    d: sy,
    tx: -bboxCx * sx,
    ty: -bboxCy * sy,
  };

  // R(theta)
  const r: AffineMatrix = {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    tx: 0,
    ty: 0,
  };

  const rst = multiplyMatrices(r, st);

  // T(cx, cy)
  return {
    a: rst.a,
    b: rst.b,
    c: rst.c,
    d: rst.d,
    tx: rst.tx + transform.cx,
    ty: rst.ty + transform.cy,
  };
}

export function pointInPolygon(pt: [number, number], points: [number, number][]): boolean {
  let inside = false;
  const x = pt[0];
  const y = pt[1];
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Hit-test whether a canvas coordinate (x, y) falls inside the layer.
 */
export function hitTestLayer(x: number, y: number, layer: LayerConfig): boolean {
  if (!layer.visible) return false;

  const bbox = layer.shape.bbox;
  const matrix = createLayerMatrix(layer.transform, bbox);
  const inv = invertMatrix(matrix);
  if (!inv) return false;

  // Map point back to source coordinates
  const [srcX, srcY] = transformPoint(inv, [x, y]);

  // Check bbox boundary first
  if (
    srcX < bbox.x ||
    srcX > bbox.x + bbox.w ||
    srcY < bbox.y ||
    srcY > bbox.y + bbox.h
  ) {
    return false;
  }

  if (layer.shape.type === "rect") {
    return true;
  }

  if (layer.shape.type === "ellipse") {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const rx = bbox.w / 2;
    const ry = bbox.h / 2;
    const dx = (srcX - cx) / rx;
    const dy = (srcY - cy) / ry;
    return dx * dx + dy * dy <= 1.0;
  }

  if (layer.shape.type === "lasso" && layer.shape.points && layer.shape.points.length >= 3) {
    return pointInPolygon([srcX, srcY], layer.shape.points);
  }

  return true;
}

function perpendicularDistance(
  pt: [number, number],
  p1: [number, number],
  p2: [number, number]
): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const magSq = dx * dx + dy * dy;
  if (magSq === 0) {
    return Math.hypot(pt[0] - p1[0], pt[1] - p1[1]);
  }
  let u = ((pt[0] - p1[0]) * dx + (pt[1] - p1[1]) * dy) / magSq;
  u = Math.max(0, Math.min(1, u));
  const projX = p1[0] + u * dx;
  const projY = p1[1] + u * dy;
  return Math.hypot(pt[0] - projX, pt[1] - projY);
}

/**
 * Douglas-Peucker simplification for lasso points.
 */
export function simplifyLasso(
  points: [number, number][],
  tolerance = 2.0,
  maxPoints = 200
): [number, number][] {
  if (points.length <= 3) return points;

  function rdp(pts: [number, number][], tol: number): [number, number][] {
    if (pts.length <= 2) return pts;
    let dmax = 0;
    let index = 0;
    const pStart = pts[0];
    const pEnd = pts[pts.length - 1];

    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpendicularDistance(pts[i], pStart, pEnd);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > tol) {
      const res1 = rdp(pts.slice(0, index + 1), tol);
      const res2 = rdp(pts.slice(index), tol);
      return res1.slice(0, res1.length - 1).concat(res2);
    } else {
      return [pStart, pEnd];
    }
  }

  let curTol = tolerance;
  let simplified = rdp(points, curTol);

  while (simplified.length > maxPoints) {
    curTol *= 1.5;
    simplified = rdp(points, curTol);
  }

  if (simplified.length < 3 && points.length >= 3) {
    const mid = Math.floor(points.length / 2);
    return [points[0], points[mid], points[points.length - 1]];
  }

  return simplified;
}
