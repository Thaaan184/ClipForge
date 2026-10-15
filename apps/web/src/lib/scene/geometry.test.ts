import { describe, it, expect } from "vitest";
import {
  identityMatrix,
  createLayerMatrix,
  invertMatrix,
  transformPoint,
  pointInPolygon,
  hitTestLayer,
  simplifyLasso,
} from "./geometry";
import { LayerConfig } from "../../types";

describe("Affine Transform Matrix", () => {
  it("identity matrix preserves points", () => {
    const pt: [number, number] = [100, 200];
    const transformed = transformPoint(identityMatrix(), pt);
    expect(transformed[0]).toBeCloseTo(100);
    expect(transformed[1]).toBeCloseTo(200);
  });

  it("matrix multiplication and inversion works correctly", () => {
    const layerTransform = {
      cx: 540,
      cy: 960,
      w: 400,
      h: 400,
      rotation: 90,
      lock_aspect: true,
      z: 0,
    };
    const bbox = { x: 100, y: 100, w: 200, h: 200 };
    const matrix = createLayerMatrix(layerTransform, bbox);
    const inv = invertMatrix(matrix);
    expect(inv).not.toBeNull();

    // Center of bbox (200, 200) transformed should equal (540, 960)
    const centerTransformed = transformPoint(matrix, [200, 200]);
    expect(centerTransformed[0]).toBeCloseTo(540);
    expect(centerTransformed[1]).toBeCloseTo(960);

    // Transforming back with inverted matrix yields original point
    const original = transformPoint(inv!, [540, 960]);
    expect(original[0]).toBeCloseTo(200);
    expect(original[1]).toBeCloseTo(200);
  });
});

describe("Geometry Hit Testing", () => {
  it("pointInPolygon ray casting detects points inside polygon", () => {
    const triangle: [number, number][] = [
      [0, 0],
      [100, 0],
      [50, 100],
    ];
    expect(pointInPolygon([50, 50], triangle)).toBe(true);
    expect(pointInPolygon([150, 50], triangle)).toBe(false);
    expect(pointInPolygon([50, -10], triangle)).toBe(false);
  });

  it("hitTestLayer checks rect layer", () => {
    const layer: LayerConfig = {
      id: "l1",
      name: "Test Rect",
      source_id: "s1",
      visible: true,
      locked: false,
      time_offset: 0,
      shape: {
        type: "rect",
        bbox: { x: 0, y: 0, w: 200, h: 200 },
        points: null,
      },
      transform: {
        cx: 540,
        cy: 960,
        w: 400,
        h: 400,
        rotation: 0,
        lock_aspect: true,
        z: 0,
      },
      style: {
        opacity: 1,
        corner_radius: 0,
        border_width: 0,
        border_color: "#000",
        shadow: { enabled: false, color: "#000", alpha: 0.5, blur: 0, offset_x: 0, offset_y: 0 },
      },
    };

    expect(hitTestLayer(540, 960, layer)).toBe(true);
    expect(hitTestLayer(540 + 190, 960 + 190, layer)).toBe(true);
    expect(hitTestLayer(540 + 210, 960, layer)).toBe(false);
    expect(hitTestLayer(540, 960, { ...layer, visible: false })).toBe(false);
  });

  it("hitTestLayer checks ellipse layer", () => {
    const layer: LayerConfig = {
      id: "l2",
      name: "Test Ellipse",
      source_id: "s1",
      visible: true,
      locked: false,
      time_offset: 0,
      shape: {
        type: "ellipse",
        bbox: { x: 0, y: 0, w: 200, h: 200 },
        points: null,
      },
      transform: {
        cx: 540,
        cy: 960,
        w: 400,
        h: 400,
        rotation: 0,
        lock_aspect: true,
        z: 0,
      },
      style: {
        opacity: 1,
        corner_radius: 0,
        border_width: 0,
        border_color: "#000",
        shadow: { enabled: false, color: "#000", alpha: 0.5, blur: 0, offset_x: 0, offset_y: 0 },
      },
    };

    expect(hitTestLayer(540, 960, layer)).toBe(true);
    // Center is inside, diagonal corner at (540+180, 960+180) is outside the circle (radius 200)
    expect(hitTestLayer(540 + 180, 960 + 180, layer)).toBe(false);
  });
});

describe("Douglas-Peucker Lasso Simplification", () => {
  it("simplifies collinear points while preserving polygon minimum vertices", () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [40, 0],
    ];
    const simplified = simplifyLasso(points, 1.0);
    // Guarantees at least 3 vertices for closed polygon rendering
    expect(simplified.length).toBe(3);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[2]).toEqual([40, 0]);
  });

  it("preserves sharp vertices", () => {
    const points: [number, number][] = [
      [0, 0],
      [50, 50],
      [100, 0],
    ];
    const simplified = simplifyLasso(points, 5.0);
    expect(simplified.length).toBe(3);
  });
});
