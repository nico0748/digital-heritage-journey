"use client";

import { Play } from "lucide-react";
import { motion } from "framer-motion";

export function StartButton() {
  return (
    <motion.span
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="relative inline-flex h-24 w-24 items-center justify-center rounded-full bg-sumi text-washi-50 shadow-lg shadow-sumi/20"
    >
      <span className="absolute inset-0 rounded-full border border-sumi/40 animate-ripple" />
      <span
        className="absolute inset-0 rounded-full border border-sumi/40 animate-ripple"
        style={{ animationDelay: "0.8s" }}
      />
      <Play size={28} className="translate-x-[2px]" />
    </motion.span>
  );
}
