import { Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';

/** Uniformes compartilhados: neblina, tempo e cores do bioma (atualizados 1x por quadro). */
export const shared = {
  uTime: { value: 0 },
  uFogColor: { value: new Color('#060607') },
  uFogNear: { value: 40 },
  uFogFar: { value: 150 },
  uBall: { value: new Vector3() },
  uWindowRate: { value: 0.4 },
};

const fogVert = /* glsl */ `
  varying float vDepth;
`;
const fogFrag = /* glsl */ `
  uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
  varying float vDepth;
  vec3 applyFog(vec3 c) { return mix(c, uFogColor, smoothstep(uFogNear, uFogFar, vDepth)); }
`;

/** Placas da pista: grade em coordenadas do mundo + brilho nas bordas (medido em unidades reais). */
export function floorMaterial(floor: Color, grid: Color, side: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, uFloor: { value: floor }, uGrid: { value: grid }, uSide: { value: side } },
    vertexShader: /* glsl */ `
      attribute vec3 aScale;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying vec3 vScale;
      ${fogVert}
      void main() {
        vLocal = position; vN = normal; vScale = aScale;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFloor; uniform vec3 uGrid; uniform vec3 uSide;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying vec3 vScale;
      ${fogFrag}
      float line(float coord, float cell, float w) {
        float g = abs(fract(coord / cell - 0.5) - 0.5) * cell;
        float fw = fwidth(coord) * 0.9;
        return 1.0 - smoothstep(w, w + fw + 0.001, g);
      }
      void main() {
        vec3 col;
        if (vN.y > 0.5) {
          float gx = line(vWorld.x + 0.0, 1.5, 0.022);
          float gz = line(vWorld.z, 3.0, 0.03);
          vec2 e = (0.5 - abs(vLocal.xz)) * vScale.xz; // distância à borda em u
          float edge = 1.0 - smoothstep(0.05, 0.12, min(e.x, e.y));
          float g = max(max(gx, gz) * 0.55, edge);
          float shade = 0.9 + 0.1 * sin(vWorld.z * 0.05);
          col = mix(uFloor * shade, uGrid, g);
        } else {
          float top = 1.0 - smoothstep(0.03, 0.08, (0.5 - vLocal.y) * vScale.y);
          col = mix(uSide * (vN.y < -0.5 ? 0.5 : 1.0), uGrid, top * 0.9);
        }
        gl_FragColor = linearToOutputTexel(vec4(applyFog(col), 1.0));
      }`,
  });
}

/**
 * Blocos/obstáculos: corpo escuro, topo mais claro, arestas brancas (legíveis de longe, não só pela cor).
 * Alguns têm rosto: olhos que seguem a bola, piscam; uns bravos, uns dormindo (aFace = [tem, semente]).
 */
export function obstacleMaterial(body: Color, edge: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, uBody: { value: body }, uEdge: { value: edge } },
    vertexShader: /* glsl */ `
      attribute vec3 aScale;
      attribute vec2 aFace;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vScale; varying vec3 vCenter; varying vec2 vFace;
      ${fogVert}
      void main() {
        vLocal = position; vN = normal; vScale = aScale; vFace = aFace;
        vCenter = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBody; uniform vec3 uEdge; uniform vec3 uBall; uniform float uTime;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vScale; varying vec3 vCenter; varying vec2 vFace;
      ${fogFrag}
      float circle(vec2 p, float r) { return 1.0 - smoothstep(r - 0.012, r + 0.012, length(p)); }
      void main() {
        vec3 d = (0.5 - abs(vLocal)) * vScale;
        float m;
        if (abs(vN.x) > 0.5) m = min(d.y, d.z);
        else if (abs(vN.y) > 0.5) m = min(d.x, d.z);
        else m = min(d.x, d.y);
        float edge = 1.0 - smoothstep(0.035, 0.08, m);
        float light = vN.y > 0.5 ? 1.12 : (abs(vN.x) > 0.5 ? 0.72 : 0.95);
        float grad = 0.85 + 0.2 * (vLocal.y + 0.5);
        vec3 col = mix(min(uBody * light * grad, vec3(1.0)), uEdge, edge * 0.95);
        // rosto na face voltada para a bola (+z)
        if (vFace.x > 0.5 && vN.z > 0.5 && vScale.x > 0.45 && vScale.y > 0.45) {
          vec2 q = vLocal.xy * vScale.xy;
          float seed = vFace.y;
          float er = min(0.2, min(vScale.x * 0.15, vScale.y * 0.17));
          float sp = min(0.34, vScale.x * 0.24);
          float ey = min(vScale.y * 0.16, 0.25);
          vec2 look = clamp(vec2(uBall.x - vCenter.x, (uBall.y - vCenter.y) * 0.6), -1.0, 1.0) * er * 0.45;
          float blink = step(0.975, fract(uTime * (0.18 + seed * 0.2) + seed * 7.0));
          float sleepy = step(0.9, seed);
          float face = 0.0;   // branco dos olhos
          float dark = 0.0;   // contorno, pálpebra, sobrancelha, boca
          float pupil = 0.0;
          for (int i = 0; i < 2; i++) {
            float sx = i == 0 ? -sp : sp;
            vec2 e = q - vec2(sx, ey);
            if (sleepy > 0.5 || blink > 0.5) {
              dark = max(dark, (1.0 - smoothstep(0.02, 0.04, abs(e.y))) * step(abs(e.x), er));
            } else {
              dark = max(dark, circle(e, er * 1.28));
              face = max(face, circle(e, er));
              pupil = max(pupil, circle(e - look, er * 0.5));
              if (seed > 0.6 && seed <= 0.9) {
                float slope = (i == 0 ? -0.45 : 0.45);
                vec2 b = e - vec2(0.0, er * 1.6);
                dark = max(dark, (1.0 - smoothstep(0.022, 0.04, abs(b.y - b.x * slope))) * step(abs(b.x), er * 1.1));
              }
            }
          }
          vec2 mq = q - vec2(0.0, ey - er * 2.6);
          if (seed < 0.3) dark = max(dark, circle(mq, er * 0.45));
          else if (seed < 0.6) dark = max(dark, (1.0 - smoothstep(0.018, 0.036, abs(mq.y + mq.x * mq.x * 1.5))) * step(abs(mq.x), er * 1.2));
          col = mix(col, vec3(0.02), clamp(dark, 0.0, 1.0));
          col = mix(col, vec3(0.98), clamp(face, 0.0, 1.0));
          col = mix(col, vec3(0.02), pupil);
        }
        gl_FragColor = linearToOutputTexel(vec4(applyFog(col), 1.0));
      }`,
  });
}

/**
 * Acelerador: faixa na pista inteira com setas grossas APONTANDO PARA A FRENTE (sentido da bola),
 * correndo para a frente, bordas acesas. vP.y é +z local = para trás; "frente" = -vP.y.
 */
export function padMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, uColor: { value: color } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aScale;
      varying vec2 vP; varying vec2 vHalf;
      ${fogVert}
      void main() {
        vP = vec2(position.x * aScale.x, position.z * aScale.z);
        vHalf = aScale.xz * 0.5;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime;
      varying vec2 vP; varying vec2 vHalf;
      ${fogFrag}
      void main() {
        float fwd = -vP.y;                        // distância para a frente
        float u = (fwd + abs(vP.x) * 0.85) / 2.6;  // ponta da seta no centro, lados para trás
        float f = fract(u - uTime * 1.5);          // corre para a frente
        float arrow = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.38, 0.43, f));
        float edgeX = 1.0 - smoothstep(0.08, 0.2, vHalf.x - abs(vP.x));
        float edgeZ = 1.0 - smoothstep(0.1, 0.3, vHalf.y - abs(vP.y));
        float pulse = 0.75 + 0.25 * sin(uTime * 8.0);
        vec3 base = vec3(0.02);
        vec3 col = mix(base, uColor, max(arrow, max(edgeX, edgeZ) * pulse));
        float a = 0.93;
        gl_FragColor = linearToOutputTexel(vec4(applyFog(col), a));
      }`,
  });
}

/** Prédios: fachada escura com janelas (algumas acesas), pilares e coroamento claro. Semente por prédio. */
export function cityMaterial(line: Color, fill: Color, windowColor: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, uLine: { value: line }, uFill: { value: fill }, uWin: { value: windowColor } },
    vertexShader: /* glsl */ `
      attribute vec3 aScale;
      attribute float aSeed;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vScale; varying float vSeed;
      ${fogVert}
      void main() {
        vLocal = position; vN = normal; vScale = aScale; vSeed = aSeed;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLine; uniform vec3 uFill; uniform vec3 uWin; uniform float uWindowRate; uniform float uTime;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vScale; varying float vSeed;
      ${fogFrag}
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 p = (vLocal + 0.5) * vScale;
        vec3 col;
        if (abs(vN.y) > 0.5) {
          // telhado com borda clara
          vec3 d = (0.5 - abs(vLocal)) * vScale;
          float e = 1.0 - smoothstep(0.1, 0.25, min(d.x, d.z));
          col = mix(uFill * 1.4, uLine, e * 0.8);
        } else {
          vec2 uv = abs(vN.x) > 0.5 ? p.zy : p.xy;
          float faceId = abs(vN.x) > 0.5 ? 1.0 : 2.0;
          float style = floor(vSeed * 3.0); // 0 janelas largas, 1 estreitas, 2 faixas
          vec2 cell = style == 1.0 ? vec2(0.9, 1.5) : (style == 2.0 ? vec2(2.4, 1.2) : vec2(1.4, 1.7));
          vec2 c = floor(uv / cell);
          vec2 f = fract(uv / cell);
          vec2 win = style == 2.0 ? vec2(0.92, 0.45) : vec2(0.55, 0.55);
          float inWin = step(abs(f.x - 0.5), win.x * 0.5) * step(abs(f.y - 0.5), win.y * 0.5);
          float h = hash(vec3(c, vSeed * 91.0 + faceId));
          float lit = step(h, uWindowRate);
          // algumas janelas acendem e apagam devagar
          float flick = step(0.985, hash(vec3(c, floor(uTime * 0.2) + vSeed)));
          lit = abs(lit - flick);
          float bright = 0.55 + 0.45 * hash(vec3(c.yx, vSeed));
          vec3 winCol = mix(uFill * 2.2, uWin * bright, lit);
          // pilares e coroamento
          float pil = step(fract(uv.x / (cell.x * 4.0)), 0.04);
          float crown = 1.0 - smoothstep(0.0, 0.6, vScale.y - p.y);
          float base = 1.0 - smoothstep(0.0, 1.2, p.y);
          col = mix(uFill, winCol, inWin * step(1.2, p.y) * step(p.y, vScale.y - 0.8));
          col = mix(col, uLine * 0.55, pil * 0.6);
          col = mix(col, uLine, crown * 0.7);
          col *= 1.0 - base * 0.5;
          col *= abs(vN.x) > 0.5 ? 0.82 : 1.0;
        }
        float fogK = smoothstep(uFogNear * 0.7, uFogFar * 1.3, vDepth);
        gl_FragColor = linearToOutputTexel(vec4(mix(col, uFogColor, fogK), 1.0));
      }`,
  });
}

/** Paredes laterais e arcos dos túneis. */
export function tunnelMaterial(color: Color, grid: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, uColor: { value: color }, uGrid: { value: grid } },
    side: DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aScale;
      varying vec3 vLocal; varying vec3 vScale;
      ${fogVert}
      void main() {
        vLocal = position; vScale = aScale;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uGrid;
      varying vec3 vLocal; varying vec3 vScale;
      ${fogFrag}
      void main() {
        vec3 p = vLocal * vScale;
        float gy = abs(fract(p.y / 0.8) - 0.5);
        float gz = abs(fract(p.z / 2.0) - 0.5);
        float g = smoothstep(0.44, 0.48, max(gy, gz));
        vec3 col = mix(uColor * 0.85, uGrid, g * 0.7);
        gl_FragColor = linearToOutputTexel(vec4(applyFog(col), 1.0));
      }`,
  });
}

export function archMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, uColor: { value: color } },
    vertexShader: /* glsl */ `
      ${fogVert}
      void main() {
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      ${fogFrag}
      void main() { gl_FragColor = linearToOutputTexel(vec4(applyFog(uColor), 1.0)); }`,
  });
}
