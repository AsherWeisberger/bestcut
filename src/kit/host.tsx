import { Component, useEffect, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import type { Clip } from "../types";
import { kitOf } from "./catalog";

type Comp = (props: Record<string, unknown>) => ReactNode;

const cache = new Map<string, Promise<Comp>>();

function ensureGlobals() {
  const g = globalThis as unknown as { __compifyGlobals?: Record<string, unknown> };
  if (!g.__compifyGlobals) g.__compifyGlobals = {};
  g.__compifyGlobals.react = React;
  g.__compifyGlobals["react/jsx-runtime"] = JsxRuntime;
}

export function loadKitModule(url: string): Promise<Comp> {
  const hit = cache.get(url);
  if (hit) return hit;
  ensureGlobals();
  const p = import(/* @vite-ignore */ url).then((mod: { default?: Comp }) => {
    const Comp = mod.default;
    if (typeof Comp !== "function") throw new Error("kit module has no default component");
    return Comp;
  });
  cache.set(url, p);
  return p;
}

export function kitProps(clip: Clip): Record<string, unknown> {
  const text = clip.text || "BESTCUT";
  const color = clip.color || "#F0EFEC";
  const fontSize = Math.max(28, clip.fontSize || 92);
  const font = {
    fontFamily: clip.textFace === "sora" ? "Sora, system-ui, sans-serif" : "Inter, system-ui, sans-serif",
    fontWeight: 700,
    fontSize,
    lineHeight: "1em",
    letterSpacing: "0.04em",
    textAlign: "center" as const,
    variant: "Bold",
  };
  return {
    words: text,
    text,
    title: text,
    label: text,
    content: text,
    color,
    textColor: color,
    fill: color,
    font,
    tag: "p",
    style: { width: "100%", height: "100%" } satisfies CSSProperties,
  };
}

class Bound extends Component<{ children: ReactNode; fallback: string }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { err: err.message || "kit failed" };
  }
  componentDidCatch(_err: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.err) {
      return <div className="kit-fallback">{this.props.fallback}</div>;
    }
    return this.props.children;
  }
}

export function KitMount({ clip, playing }: { clip: Clip; playing: boolean }) {
  const item = kitOf(clip.inPreset || clip.preset);
  const [Comp, setComp] = useState<Comp | null>(null);
  const [fail, setFail] = useState<string | null>(null);

  useEffect(() => {
    if (!item?.moduleUrl) return;
    let alive = true;
    loadKitModule(item.moduleUrl)
      .then((C) => {
        if (alive) setComp(() => C);
      })
      .catch((e: Error) => {
        if (alive) setFail(e.message || "load failed");
      });
    return () => {
      alive = false;
    };
  }, [item?.moduleUrl]);

  useEffect(() => {
    if (!playing) return;
    const root = document.querySelector(`[data-kit-clip="${clip.id}"]`) as HTMLElement | null;
    if (!root) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const el = document.querySelector(`[data-kit-clip="${clip.id}"]`) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const u = ((now - t0) / 1000) % 4;
      const x = r.left + r.width * (0.5 + 0.28 * Math.cos(u * 1.7));
      const y = r.top + r.height * (0.5 + 0.22 * Math.sin(u * 2.1));
      const opts = { bubbles: true, clientX: x, clientY: y, pointerId: 1 } as PointerEventInit;
      el.dispatchEvent(new PointerEvent("pointermove", opts));
      el.dispatchEvent(new MouseEvent("mousemove", opts));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, clip.id, Comp]);

  if (!item) return null;
  if (fail) return <div className="kit-fallback">{clip.text}</div>;
  if (!Comp) return <div className="kit-pending" />;

  return (
    <Bound fallback={clip.text}>
      <div className="kit-mount" data-kit-clip={clip.id}>
        <Comp {...kitProps(clip)} />
      </div>
    </Bound>
  );
}
