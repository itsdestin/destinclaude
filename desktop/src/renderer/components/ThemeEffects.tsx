import React, { useEffect, useRef } from 'react';
import { useTheme } from '../state/theme-context';

interface Particle {
  x: number; y: number; speed: number; opacity: number; length: number;
}

function drawRain(ctx: CanvasRenderingContext2D, particles: Particle[], w: number, h: number, rainColor: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = rainColor;
  ctx.lineWidth = 1;
  for (const p of particles) {
    ctx.globalAlpha = p.opacity;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - 1, p.y + p.length);
    ctx.stroke();
    p.y += p.speed;
    if (p.y > h) { p.y = -p.length; p.x = Math.random() * w; }
  }
  ctx.globalAlpha = 1;
}

function drawDust(ctx: CanvasRenderingContext2D, particles: Particle[], w: number, h: number, accent: string) {
  ctx.clearRect(0, 0, w, h);
  for (const p of particles) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
    ctx.fill();
    p.y -= p.speed * 0.3;
    p.x += Math.sin(p.y * 0.02) * 0.5;
    if (p.y < 0) { p.y = h; p.x = Math.random() * w; }
  }
  ctx.globalAlpha = 1;
}

function drawEmber(ctx: CanvasRenderingContext2D, particles: Particle[], w: number, h: number, accent: string) {
  ctx.clearRect(0, 0, w, h);
  const t = Date.now() * 0.001; // hoisted: one call per frame, not per particle
  for (const p of particles) {
    ctx.globalAlpha = p.opacity * 0.8;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    p.y -= p.speed;
    p.x += Math.sin(t + p.length) * 0.8;
    p.opacity -= 0.002;
    if (p.y < 0 || p.opacity <= 0) {
      p.y = h + 10; p.x = Math.random() * w;
      p.opacity = Math.random() * 0.5 + 0.2;
    }
  }
  ctx.globalAlpha = 1;
}

const PARTICLE_COUNT = 60;

export default function ThemeEffects() {
  const { activeTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  const preset = activeTheme?.effects?.particles ?? 'none';
  const accent = activeTheme?.tokens?.accent ?? '#888888';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || preset === 'none') {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: Math.random() * 2 + 1,
      opacity: Math.random() * 0.4 + 0.1,
      length: Math.random() * 15 + 5,
    }));

    const rainColor = accent + '40'; // computed once per effect run, not per-frame
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      if (preset === 'rain') drawRain(ctx, particlesRef.current, w, h, rainColor);
      else if (preset === 'dust') drawDust(ctx, particlesRef.current, w, h, accent);
      else if (preset === 'ember') drawEmber(ctx, particlesRef.current, w, h, accent);
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [preset, accent]);

  if (preset === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.6,
      }}
      aria-hidden="true"
    />
  );
}
