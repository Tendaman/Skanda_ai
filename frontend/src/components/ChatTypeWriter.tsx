"use client";
import { TypewriterEffect } from "./ui/typewriter-effect";

export function ChatTypeWriter() {
  const words = [
    {
      text: "Let's",
    },
    {
      text: "chat,",
    },
    {
      text: "what",
    },
    {
      text: "do",
    },
    {
      text: "you",
    },
    {
      text: "need",
    },
    {
      text: "help",
    },
    {
      text: "with?",
    },
  ];
  return (
    <div className="flex items-center justify-center h-full text-lg font-medium select-none px-5">
      <TypewriterEffect words={words} textColor="text-gray-400"/>
    </div>
  );
}
