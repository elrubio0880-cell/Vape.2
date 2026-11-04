import React from 'react';

export function SmokeOverlay() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* 1. Urban Street Graffiti Wall Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.24] mix-blend-luminosity filter contrast-125 pointer-events-none"
        style={{ backgroundImage: `url('/assets/graffiti-wall.jpg')` }}
      />
      {/* Deep street vignette to guarantee perfect contrast and text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#08050e]/85 via-[#08050e]/55 to-[#08050e]/95 pointer-events-none" />

      {/* 2. REAL FILMED SMOKE VIDEO: Authentic billowing smoke footage with zero hard edges */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-screen opacity-45 overflow-hidden"
        style={{
          maskImage: 'radial-gradient(ellipse 92% 82% at 50% 50%, black 25%, transparent 95%)',
          WebkitMaskImage: 'radial-gradient(ellipse 92% 82% at 50% 50%, black 25%, transparent 95%)',
        }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
          className="w-full h-full object-cover pointer-events-none filter contrast-125 brightness-110"
        >
          <source src="/assets/real-smoke.webm" type="video/webm" />
        </video>
      </div>

      {/* 3. REAL FILMED SMOKE VIDEO LAYER 2: Dense vapor plumes rising organically */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-screen opacity-35 overflow-hidden"
        style={{
          maskImage: 'radial-gradient(ellipse 88% 78% at 50% 60%, black 20%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(ellipse 88% 78% at 50% 60%, black 20%, transparent 90%)',
        }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
          className="w-full h-full object-cover pointer-events-none filter hue-rotate-[260deg] contrast-125"
        >
          <source src="/assets/real-smoke-plume.webm" type="video/webm" />
        </video>
      </div>

      {/* 4. Ambient Neon Atmosphere (Purple & Cyan Glows) */}
      <div className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full blur-[160px] bg-purple-700/18 pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-[600px] h-[600px] rounded-full blur-[170px] bg-cyan-600/14 pointer-events-none" />
      <div className="absolute -bottom-32 left-1/4 w-[750px] h-[550px] rounded-full blur-[180px] bg-fuchsia-800/15 pointer-events-none" />
    </div>
  );
}
