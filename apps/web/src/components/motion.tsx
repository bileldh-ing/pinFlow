"use client";
/**
 * Motion primitives. Only transform/opacity are animated (GPU-friendly), durations
 * stay in the 120–260 ms band, and everything collapses to an instant state when
 * the user prefers reduced motion.
 */
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.2, 0.8, 0.2, 1] as const;

export function Reveal({ children, delay = 0, y = 16, className = "", as = "div" }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "li" | "section" }) {
  const reduce = useReducedMotion();
  const M = as === "li" ? motion.li : as === "section" ? motion.section : motion.div;
  if (reduce) return <M className={className}>{children}</M>;
  return (
    <M className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.26, ease: EASE, delay }}>
      {children}
    </M>
  );
}

/** Staggered list: children animate in one after another (40 ms apart). */
export function Stagger({ children, className = "", as = "ul", ...rest }: { children: ReactNode; className?: string; as?: "ul" | "div" } & Omit<HTMLMotionProps<"ul">, "children">) {
  const reduce = useReducedMotion();
  const M = as === "div" ? motion.div : motion.ul;
  return (
    <M className={className} initial={reduce ? false : "hidden"} whileInView="show" viewport={{ once: true, margin: "0px 0px -6% 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }} {...(rest as object)}>
      {children}
    </M>
  );
}

export function StaggerItem({ children, className = "", as = "li", ...rest }: { children: ReactNode; className?: string; as?: "li" | "div"; "data-testid"?: string; id?: string }) {
  const M = as === "div" ? motion.div : motion.li;
  return (
    <M className={className} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE } } }} {...rest}>
      {children}
    </M>
  );
}

/** Page/panel enter transition. */
export function FadeIn({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

export { motion, useReducedMotion };
