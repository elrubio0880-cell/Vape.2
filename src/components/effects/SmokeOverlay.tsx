import React, { useEffect, useRef, useCallback } from 'react';
import graffitiWallImg from '../../assets/images/graffiti_brick_wall_1793233367494.jpg';

interface PuffWave {
  startTime: number;
  originX: number; // 0.0 to 1.0
  strength: number;
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Volumetric Domain-Warped Curl Smoke Fragment Shader (Real-time GPU Fluid)
const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  varying vec2 v_uv;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;
  uniform vec3 u_puff0; // (ageSeconds, originX, strength)
  uniform vec3 u_puff1;
  uniform vec3 u_puff2;

  // High-frequency hash & 2D smooth value/gradient noise
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  // Simplex/Gradient noise for organic curl filaments (zero blocky or circular artifacts)
  float gnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.5 + 0.5;
  }

  // Rotational matrix between octaves to eliminate axial grid alignment
  const mat2 m2 = mat2(0.80, -0.60, 0.60, 0.80);

  // 6-Octave Fractal Brownian Motion (fBm) for silky smoke wisps
  float fbm(vec2 p) {
    float f = 0.0;
    float amp = 0.5000;
    for (int i = 0; i < 6; i++) {
      f += amp * gnoise(p);
      p = m2 * p * 2.03 + vec2(13.7, 7.3);
      amp *= 0.50;
    }
    return f;
  }

  // Computes a single volumetric exhalation puff plume rising from the bottom
  float computePuffPlume(vec2 uv, float aspect, vec3 puff, float warpSignal) {
    float age = puff.x;
    float ox = puff.y;
    float str = puff.z;
    if (str <= 0.001 || age < 0.0 || age > 6.5) return 0.0;

    float progress = age / 5.5;
    // Plume core rises rapidly at first, then slows as it expands into the room
    float centerY = -0.05 + (1.0 - pow(1.0 - min(1.0, progress), 2.1)) * 0.88;
    // Cone widens as it rises and curls with the fluid field
    float spreadX = 0.10 + progress * 0.52;
    float spreadY = 0.16 + progress * 0.48;

    float dx = (uv.x - ox) * aspect + (warpSignal - 0.5) * (0.28 + progress * 0.35);
    float dy = (uv.y - centerY) + (warpSignal - 0.5) * 0.18;

    float distSq = (dx * dx) / (spreadX * spreadX) + (dy * dy) / (spreadY * spreadY);
    float radialMask = exp(-distSq * 2.35);

    // Smooth attack and slow organic dissipation
    float fadeIn = smoothstep(0.0, 0.28, age);
    float fadeOut = 1.0 - smoothstep(1.2, 5.6, age);

    return radialMask * fadeIn * fadeOut * str;
  }

  void main() {
    float aspect = u_resolution.x / max(1.0, u_resolution.y);
    vec2 p = vec2(v_uv.x * aspect, v_uv.y);

    // Upward thermal convection + gentle horizontal street breeze
    float t = u_time * 0.18;
    vec2 flowCoord = p * 2.15 + vec2(sin(t * 0.35) * 0.25, -t * 1.35);

    // Domain Warping Pass 1: Large rolling vortices
    vec2 q = vec2(
      fbm(flowCoord + vec2(0.0, 0.0) + 0.12 * t),
      fbm(flowCoord + vec2(5.2, 1.3) - 0.15 * t)
    );

    // Domain Warping Pass 2: Fine curling smoke tendrils & wisps
    vec2 r = vec2(
      fbm(flowCoord + 3.4 * q + vec2(1.7, 9.2) + 0.24 * t),
      fbm(flowCoord + 3.4 * q + vec2(8.3, 2.8) - 0.21 * t)
    );

    // Final warped fluid density
    float rawSmoke = fbm(flowCoord + 3.1 * r);

    // Carve realistic smoke filaments (billowy clouds with wispy translucent edges)
    float filament = smoothstep(0.34, 0.84, rawSmoke);
    float fineWisps = smoothstep(0.42, 0.78, length(r)) * 0.45;
    float smokeStructure = clamp(filament * 0.82 + fineWisps * filament, 0.0, 1.0);

    // Vertical buoyancy envelope: denser near the bottom, rising and feathering softly upward
    float bottomEnvelope = pow(clamp(1.0 - v_uv.y * 0.78, 0.0, 1.0), 1.35);
    float ambientBillow = 0.35 + 0.65 * bottomEnvelope;

    // Base ambient smoke density scaled by user intensity (Suave / Intenso / Épico)
    float ambientDensity = smokeStructure * ambientBillow * u_intensity;

    // Add interactive Exhalation Puff Plumes ("¡Caladas!")
    float warpSignal = (q.x + r.y) * 0.5;
    float burstPlume =
      computePuffPlume(v_uv, aspect, u_puff0, warpSignal) +
      computePuffPlume(v_uv, aspect, u_puff1, warpSignal) +
      computePuffPlume(v_uv, aspect, u_puff2, warpSignal);

    // Modulate burst plume by fine smoke turbulence so the puff has authentic curly tendrils
    float texturedBurst = burstPlume * (0.45 + 0.85 * smoothstep(0.22, 0.78, rawSmoke));

    float totalDensity = clamp(ambientDensity + texturedBurst, 0.0, 0.92);

    // Realistic White/Silver Vapor Color with subtle Neon Purple & Cyan subsurface scattering
    vec3 pureVaporWhite = vec3(0.95, 0.96, 0.99);
    vec3 softShadowVapor = vec3(0.76, 0.79, 0.88);
    vec3 neonPurpleTint = vec3(0.72, 0.42, 0.98);
    vec3 neonCyanTint   = vec3(0.32, 0.88, 0.96);

    // Internal volumetric self-shading based on warp thickness
    vec3 baseSmokeColor = mix(softShadowVapor, pureVaporWhite, smoothstep(0.25, 0.78, rawSmoke));

    // Subtle neon reflections along the outer folds of the smoke
    float purpleZone = smoothstep(0.35, 0.85, q.x) * (1.0 - v_uv.x * 0.45);
    float cyanZone   = smoothstep(0.35, 0.85, r.y) * (0.45 + v_uv.x * 0.55);

    vec3 neonReflection =
      neonPurpleTint * purpleZone * 0.16 +
      neonCyanTint   * cyanZone   * 0.14;

    // Brighter white core when a fresh vape puff ("calada") is exhaled
    vec3 finalColor = mix(
      baseSmokeColor + neonReflection,
      vec3(0.98, 0.99, 1.0),
      clamp(texturedBurst * 0.65, 0.0, 0.75)
    );

    gl_FragColor = vec4(finalColor * totalDensity, totalDensity);
  }
`;

export function SmokeOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const puffsRef = useRef<PuffWave[]>([]);
  const startTimeRef = useRef<number>(performance.now());

  const triggerPuffWave = useCallback((_customFlavor?: string, originXNorm?: number) => {
    const nowSec = (performance.now() - startTimeRef.current) / 1000;
    const strength = 0.9;

    // Push two staggered plumes (one from the button/action area and one central exhalation)
    const nextPuffs: PuffWave[] = [
      {
        startTime: nowSec,
        originX: originXNorm ?? 0.52 + (Math.random() - 0.5) * 0.22,
        strength,
      },
      {
        startTime: nowSec - 0.08,
        originX: 0.82 + (Math.random() - 0.5) * 0.1,
        strength: strength * 0.75,
      },
      ...puffsRef.current,
    ].slice(0, 3);

    puffsRef.current = nextPuffs;
  }, []);

  // Listen to global 'vape-smoke-burst' event from StoreCatalog and other components
  useEffect(() => {
    const handleBurstEvent = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ flavor?: string }>;
      triggerPuffWave(customEvt.detail?.flavor, 0.5);
    };

    window.addEventListener('vape-smoke-burst', handleBurstEvent);
    return () => {
      window.removeEventListener('vape-smoke-burst', handleBurstEvent);
    };
  }, [triggerPuffWave]);

  // WebGL Volumetric Fluid Smoke Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      (canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false }) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: true, antialias: false }) as WebGLRenderingContext | null);

    if (!gl) return;

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    gl.useProgram(program);

    // Full-screen quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uResLoc = gl.getUniformLocation(program, 'u_resolution');
    const uTimeLoc = gl.getUniformLocation(program, 'u_time');
    const uIntensityLoc = gl.getUniformLocation(program, 'u_intensity');
    const uPuff0Loc = gl.getUniformLocation(program, 'u_puff0');
    const uPuff1Loc = gl.getUniformLocation(program, 'u_puff1');
    const uPuff2Loc = gl.getUniformLocation(program, 'u_puff2');

    // Render at 0.65x device resolution for silky-smooth 60 FPS and natural atmospheric softness
    const handleResize = () => {
      const scale = 0.65;
      canvas.width = Math.max(320, Math.floor(window.innerWidth * scale));
      canvas.height = Math.max(240, Math.floor(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    let animId: number;

    const renderFrame = () => {
      const elapsedSec = (performance.now() - startTimeRef.current) / 1000;
      const baseIntensity = 0.44;

      gl.uniform2f(uResLoc, canvas.width, canvas.height);
      gl.uniform1f(uTimeLoc, elapsedSec);
      gl.uniform1f(uIntensityLoc, baseIntensity);

      const p0 = puffsRef.current[0];
      const p1 = puffsRef.current[1];
      const p2 = puffsRef.current[2];

      gl.uniform3f(
        uPuff0Loc,
        p0 ? elapsedSec - p0.startTime : 99.0,
        p0 ? p0.originX : 0.5,
        p0 ? p0.strength : 0.0
      );
      gl.uniform3f(
        uPuff1Loc,
        p1 ? elapsedSec - p1.startTime : 99.0,
        p1 ? p1.originX : 0.5,
        p1 ? p1.strength : 0.0
      );
      gl.uniform3f(
        uPuff2Loc,
        p2 ? elapsedSec - p2.startTime : 99.0,
        p2 ? p2.originX : 0.5,
        p2 ? p2.strength : 0.0
      );

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animId = window.requestAnimationFrame(renderFrame);
    };

    animId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <>
      {/* Fixed Background & Real-Time WebGL Volumetric Fluid Smoke Layer */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
        {/* 1. Full-Color Urban Street Graffiti Brick Wall Background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.26] filter contrast-125 pointer-events-none"
          style={{ backgroundImage: `url(${graffitiWallImg})` }}
        />
        {/* Deep street vignette to guarantee contrast and text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060d0a]/88 via-[#07100c]/70 to-[#060d0a]/94 pointer-events-none" />

        {/* 2. Ambient Neon Atmosphere (Emerald & Cyan Glows) */}
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full blur-[160px] bg-emerald-700/18 pointer-events-none" />
        <div className="absolute top-1/3 -right-32 w-[600px] h-[600px] rounded-full blur-[170px] bg-teal-600/14 pointer-events-none" />
        <div className="absolute -bottom-32 left-1/4 w-[750px] h-[550px] rounded-full blur-[180px] bg-emerald-800/15 pointer-events-none" />

        {/* 3. Real-Time GPU Volumetric Curl Smoke Shader Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen"
        />
      </div>
    </>
  );
}
